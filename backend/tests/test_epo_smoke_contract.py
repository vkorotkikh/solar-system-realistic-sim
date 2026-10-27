"""SCN-079: verify real result nesting and return process failure for failed/empty smoke runs."""
import sys
import pytest
from mission.epo import smoke_test
from mission.epo.config import EpisodeConfig, EpisodeFamilyPolicy
from mission.epo.verifier import DemoVerifier
from mission.epo.sample_episodes import SAMPLE_EPISODE_FAMILIES
from trajectory.contracts import ALLOWED_TRAJECTORY_OBJECTIVES


@pytest.mark.parametrize("valid,expected", [(True,True),(False,False)])
def test_verifier_reads_recommendation_verification(valid,expected):
    verifier=DemoVerifier({"known":EpisodeFamilyPolicy(min_mission_score=0,max_failure_probability=0.1)})
    result={"status":"ok","recommendation":{"missionScore":100,"risk":{"failureProbability":0},
             "verification":{"valid":valid}},"verification":{"valid":not valid}}
    passed,reasons,_=verifier.verify(EpisodeConfig("one","known",{}),result)
    assert passed is expected
    assert reasons == ([] if valid else ["embedded_verifier_rejected"])


def test_all_sample_objectives_are_supported():
    for family in SAMPLE_EPISODE_FAMILIES:
        for episode in family.episodes:
            assert episode.mission_payload["objective"] in ALLOWED_TRAJECTORY_OBJECTIVES


def test_real_planner_known_pass_and_failure_episodes():
    from mission.epo.config import EpisodeFamily
    from mission.epo.runners import EpisodeRunner
    payload=dict(from_id="earth",target_id="mars",return_id="earth",departure_jd=2460500.5,
                 max_assists=0,ephemeris_provider="kepler",risk_samples=30,mining_days=10,
                 storage_loss_rate_per_day=0, vehicle={"name":"ample","stages":[
                     dict(name="stage",dry_mass_kg=100,propellant_mass_kg=1000000,isp_s=10000)]})
    episodes=(EpisodeConfig("known_pass","known",payload),
              EpisodeConfig("known_fail","known",{**payload,"payload_mass_kg":1e10}))
    result=EpisodeRunner().run_family(EpisodeFamily("known","independent pass/fail gate",
        EpisodeFamilyPolicy(max_failure_probability=0.1),episodes))
    assert result.passed == 1 and result.failed == 1 and result.exception_count == 0
    assert result.records[0].verifier_passed is True
    assert result.records[1].verifier_passed is False


@pytest.mark.parametrize("totals,code", [
    ({"total":30,"passed":0,"failed":30,"exceptions":0},1),
    ({"total":0,"passed":0,"failed":0,"exceptions":0},1),
    ({"total":2,"passed":1,"failed":1,"exceptions":0},1),
    ({"total":2,"passed":2,"failed":0,"exceptions":0},0),
])
def test_smoke_main_exits_from_actual_totals(totals,code,monkeypatch,capsys):
    monkeypatch.setattr(smoke_test,"run_smoke_test",lambda names:{"totals":totals,"families":{}})
    monkeypatch.setattr(sys,"argv",["smoke_test","--compact"])
    with pytest.raises(SystemExit) as exc:
        smoke_test.main()
    assert exc.value.code == code
    assert '"totals"' in capsys.readouterr().out
