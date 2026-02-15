"""
Trajectory planning package for mission/course computations.

This package centralizes route-planning logic so mission design flows
live in backend services instead of frontend rendering code.
"""

from .planner import plan_interplanetary_route

__all__ = ["plan_interplanetary_route"]

