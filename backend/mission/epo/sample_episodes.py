"""Seeded episode families for EPO smoke-test loops."""

from __future__ import annotations

from .config import EpisodeConfig, EpisodeFamily, EpisodeFamilyPolicy


def _make_family(
    family_name: str,
    family_description: str,
    target_ids: list[str],
    *,
    from_id: str,
    return_id: str,
    objective: str,
    max_assists: int,
    payload_mass_kg: float,
    risk_failure_probability_threshold: float,
    min_mission_score: float | None,
    prograde: bool = True,
    departure_start: float = 2_460_500.5,
    departure_step_days: float = 35.0,
) -> EpisodeFamily:
    episodes = tuple(
        EpisodeConfig(
            episode_id=f"{family_name}_{index + 1:02d}",
            family=family_name,
            mission_payload={
                "from_id": from_id,
                "target_id": target_id,
                "return_id": return_id,
                "departure_jd": departure_start + index * departure_step_days,
                "objective": objective,
                "max_assists": max_assists,
                "ephemeris_provider": "auto",
                "payload_mass_kg": payload_mass_kg,
                "risk_failure_probability_threshold": risk_failure_probability_threshold,
                "prograde": prograde,
            },
            family_name=family_name,
            notes=f"Episode {index + 1} in {family_name}",
        )
        for index, target_id in enumerate(target_ids)
    )

    policy = EpisodeFamilyPolicy(
        min_mission_score=min_mission_score,
        max_failure_probability=risk_failure_probability_threshold,
        require_verifier_valid=True,
        require_recommendation=True,
    )

    return EpisodeFamily(
        name=family_name,
        description=family_description,
        policy=policy,
        episodes=episodes,
    )


def _default_asteroid_targets() -> list[str]:
    return [
        "ceres",
        "vesta",
        "pallas",
        "hygiea",
        "juno",
        "psyche",
        "eunomia",
        "europa52",
        "interamnia704",
        "flora",
    ]


def _outer_family_targets() -> list[str]:
    return [
        "jupiter",
        "saturn",
        "uranus",
        "neptune",
        "pluto",
        "eris",
        "makemake",
        "haumea",
        "quaoar",
        "sedna",
    ]


def _return_trip_targets() -> list[str]:
    return [
        "metis",
        "amphitrite",
        "euphrosyne",
        "cybele",
        "sylvia",
        "camilla",
        "gonggong",
        "varuna",
        "ixion",
        "salacia",
    ]


MINING_MISSION_FAMILY = _make_family(
    "mining_core",
    "asteroid-mining baseline missions (earth start)",
    _default_asteroid_targets(),
    from_id="earth",
    return_id="earth",
    objective="min_delta_v",
    max_assists=1,
    payload_mass_kg=6_500,
    risk_failure_probability_threshold=0.55,
    min_mission_score=20.0,
    prograde=True,
    departure_start=2_460_500.5,
    departure_step_days=30,
)

REACHER_FAMILY = _make_family(
    "outer_reacher",
    "long-leg outer system transfer smoke tests",
    _outer_family_targets(),
    from_id="earth",
    return_id="earth",
    objective="min_distance",
    max_assists=2,
    payload_mass_kg=5_800,
    risk_failure_probability_threshold=0.45,
    min_mission_score=0.0,
    prograde=True,
    departure_start=2_460_600.5,
    departure_step_days=45,
)

RETURN_AND_DELAY_FAMILY = _make_family(
    "return_pressure",
    "return-first sequencing and high-stress payload closure",
    _return_trip_targets(),
    from_id="mars",
    return_id="earth",
    objective="min_distance",
    max_assists=1,
    payload_mass_kg=5_100,
    risk_failure_probability_threshold=0.35,
    min_mission_score=5.0,
    prograde=False,
    departure_start=2_460_400.5,
    departure_step_days=55,
)

SAMPLE_EPISODE_FAMILIES: tuple[EpisodeFamily, ...] = (
    MINING_MISSION_FAMILY,
    REACHER_FAMILY,
    RETURN_AND_DELAY_FAMILY,
)


def with_verifier_policies() -> dict[str, EpisodeFamilyPolicy]:
    return {family.name: family.policy for family in SAMPLE_EPISODE_FAMILIES}
