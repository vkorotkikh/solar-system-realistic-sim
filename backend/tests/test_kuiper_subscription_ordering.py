"""Real producer/command ordering evidence, not a subscription-safety pass.

Direct execution prints an unmodified native wire capture for the client gate.
The transport barrier models a pending ASGI send; no payload is fabricated or
reordered and no sleep duration decides the race.
"""
import asyncio
import json
from unittest.mock import patch

import numpy as np
import pytest

import server
from data.bodies import ALL_BODIES
from sim.kuiper import KuiperBeltEngine
from sim.rebound_nbody import REBOUNDEngine


async def capture_connected():
    """Capture the real endpoint handshake, then disconnect and reap its runner."""
    class Transport:
        query_params = {"engine": "rebound", "integrator": "whfast"}
        connected = None

        async def send_text(self, text):
            payload = json.loads(text)
            assert payload["type"] == "connected", payload
            self.connected = payload
            raise server.WebSocketDisconnect(code=1000)

    transport = Transport()
    await server._serve_simulation_websocket(transport)
    assert transport.connected is not None
    return transport.connected


async def capture_subscription_ordering(subscription_ids=("1", "2")):
    connected = await capture_connected()
    engine = REBOUNDEngine(integrator="whfast")
    engine.initialize(ALL_BODIES)
    runner = server.SimulationRunner(engine, target_fps=60)
    runner.paused = True
    runner.kuiper = KuiperBeltEngine(particle_count=32)
    loop = asyncio.get_running_loop()
    second_produced = asyncio.Event()
    commands = []
    produced = []
    original_command = runner._handle_command
    original_state = runner.kuiper.get_state

    def record_command(command):
        original_command(command)
        commands.append(command)

    def record_state():
        snapshot = original_state()
        produced.append(snapshot)
        if sum(cmd["type"] == "activate_kuiper" for cmd in commands) == 2:
            loop.call_soon_threadsafe(second_produced.set)
        return snapshot

    class Transport:
        def __init__(self):
            self.inbound = asyncio.Queue()
            self.delivered = asyncio.Queue()
            self.held = asyncio.Event()
            self.release = asyncio.Event()
            self.pending = None

        async def receive(self):
            return await self.inbound.get()

        async def send_text(self, text):
            payload = json.loads(text)
            if "kuiper" in payload and self.pending is None:
                self.pending = payload
                self.held.set()
                await self.release.wait()
            self.delivered.put_nowait(payload)

        async def close(self, **_kwargs):
            raise AssertionError("Production WebSocket unexpectedly closed")

        def command(self, command):
            self.inbound.put_nowait({"type": "websocket.receive", "text": json.dumps(command)})

        async def kuiper_delivery(self):
            while True:
                payload = await asyncio.wait_for(self.delivered.get(), 5)
                assert payload["type"] != "error", payload
                if "kuiper" in payload:
                    return payload

    transport = Transport()
    tasks = []
    rng = np.random.default_rng(20261014)
    first = {"type": "activate_kuiper", "center": [43, 0, 0], "spread": 5}
    second = {"type": "activate_kuiper", "center": [50, 0, 0], "spread": 5}
    for command, identity in zip((first, second), subscription_ids, strict=True):
        if identity is not None:
            command["subscription_id"] = identity
    try:
        with patch.object(runner, "_handle_command", side_effect=record_command), \
             patch.object(runner.kuiper, "get_state", side_effect=record_state), \
             patch("sim.kuiper.np.random.default_rng", return_value=rng):
            runner.start()
            tasks = [
                asyncio.create_task(server._ws_receive_loop(transport, runner)),
                asyncio.create_task(server._ws_send_loop(transport, runner, stream_hz=240)),
            ]
            transport.command(first)
            await asyncio.wait_for(transport.held.wait(), 5)
            assert transport.pending["kuiper"] == produced[0]
            transport.command({"type": "deactivate_kuiper"})
            transport.command(second)
            await asyncio.wait_for(second_produced.wait(), 5)
            assert [cmd["type"] for cmd in commands] == [
                "activate_kuiper", "deactivate_kuiper", "activate_kuiper"
            ]
            assert produced[-1]["positions"] != transport.pending["kuiper"]["positions"]
            # B has actually produced a snapshot, yet A is still in send_text.
            transport.release.set()
            late_old = await transport.kuiper_delivery()
            assert late_old == transport.pending
            replacement = await transport.kuiper_delivery()
            assert replacement["kuiper"]["positions"] != late_old["kuiper"]["positions"]
            return {
                "capture": {
                    "producer": "SimulationRunner._run_frames -> KuiperBeltEngine.get_state",
                    "command_path": "_ws_receive_loop -> send_command -> _handle_command",
                    "delivery_path": "_ws_send_loop -> _ws_send_text -> pending ASGI send",
                    "main_engine": "REBOUNDEngine/whfast",
                    "rng_seed": 20261014,
                    "particle_count": 32,
                    "paused": True,
                    "replacement_produced_before_old_delivery": True,
                },
                "connected": connected,
                "commands": commands,
                "late_old": late_old,
                "replacement": replacement,
            }
    finally:
        for task in tasks:
            task.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)
        assert await asyncio.to_thread(runner.stop), "Native runner did not terminate"


def test_real_command_fifo_does_not_order_pending_outbound_state_after_reactivation():
    capture = asyncio.run(capture_subscription_ordering())
    assert capture["capture"]["replacement_produced_before_old_delivery"]
    assert capture["late_old"]["kuiper"]["binary_pairs"]
    assert capture["replacement"]["kuiper"]["binary_pairs"]
    assert capture["connected"]["kuiper_subscription_version"] == 1
    assert capture["connected"]["kuiper_activation_error_version"] == 1
    assert capture["late_old"]["kuiper_subscription_id"] == "1"
    assert capture["replacement"]["kuiper_subscription_id"] == "2"


@pytest.mark.parametrize("identities", [(None, None), ("old", None), (None, "new")])
def test_native_producer_preserves_legacy_and_mixed_activation_commands(identities):
    capture = asyncio.run(capture_subscription_ordering(identities))
    for key, identity in zip(("late_old", "replacement"), identities, strict=True):
        payload = capture[key]
        if identity is None:
            assert "kuiper_subscription_id" not in payload
        else:
            assert payload["kuiper_subscription_id"] == identity
        assert payload["kuiper"]["velocity_units"] == "AU/yr"
        assert payload["kuiper"]["binary_pairs"]


@pytest.mark.parametrize("identity", ["a", "1", "activation_B-3", "x" * 64])
def test_ingress_preserves_bounded_activation_identity(identity):
    command = {"type": "activate_kuiper", "subscription_id": identity}
    assert server._normalize_ws_command(command) == (command, None)


@pytest.mark.parametrize("identity", [None, True, 1, "", "x" * 65, "has space", "\u00e9", [], {}])
def test_invalid_identity_is_rejected_before_ingress_or_native_activation(identity):
    command = {"type": "activate_kuiper", "subscription_id": identity}
    normalized, error = server._normalize_ws_command(command)
    assert normalized is None
    assert error
    engine = REBOUNDEngine(integrator="whfast")
    engine.initialize(ALL_BODIES)
    runner = server.SimulationRunner(engine)
    runner.kuiper = KuiperBeltEngine(particle_count=8)
    runner._handle_command({"type": "activate_kuiper", "subscription_id": "initial"})
    assert runner.get_response() is None
    before = runner.kuiper.get_state()
    runner._handle_command(command)
    response = runner.get_response()
    assert response["code"] == "bad_request"
    assert response["action"] == "activate_kuiper"
    assert runner.kuiper.active
    assert runner.kuiper.get_state() == before
    assert runner.stop()


if __name__ == "__main__":
    print(json.dumps(asyncio.run(capture_subscription_ordering()), allow_nan=False))
