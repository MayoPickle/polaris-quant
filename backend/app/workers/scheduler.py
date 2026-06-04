"""APScheduler setup.

Builds a scheduler that runs in the worker process (separate from the web
process). On start it loads active strategy instances and registers a job per
instance based on its `schedule` (cron expression in market timezone).
"""

from __future__ import annotations

from apscheduler.schedulers.blocking import BlockingScheduler
from apscheduler.triggers.cron import CronTrigger

from app.core.config import settings
from app.core.logging import get_logger
from app.db.session import SessionLocal
from app.models.strategy import StrategyInstance
from app.workers.jobs.run_strategy import run_strategy_instance

logger = get_logger(__name__)


def _run_instance(instance_id: int) -> None:
    db = SessionLocal()
    try:
        run_strategy_instance(db, instance_id)
    except Exception:  # noqa: BLE001 — never let one job kill the scheduler
        logger.exception("Strategy job %s failed", instance_id)
    finally:
        db.close()


def build_scheduler() -> BlockingScheduler:
    scheduler = BlockingScheduler(timezone=settings.SCHEDULER_TIMEZONE)

    db = SessionLocal()
    try:
        instances = (
            db.query(StrategyInstance)
            .filter(StrategyInstance.is_active.is_(True), StrategyInstance.schedule != "")
            .all()
        )
        for inst in instances:
            scheduler.add_job(
                _run_instance,
                CronTrigger.from_crontab(inst.schedule, timezone=settings.SCHEDULER_TIMEZONE),
                args=[inst.id],
                id=f"strategy-{inst.id}",
                replace_existing=True,
            )
            logger.info("Scheduled strategy %s (%s) at '%s'", inst.id, inst.name, inst.schedule)
    finally:
        db.close()

    return scheduler
