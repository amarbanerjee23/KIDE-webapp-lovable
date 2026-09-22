import os

from celery import Celery

BROKER_URL = os.getenv("CELERY_BROKER_URL", "amqp://guest:guest@rabbitmq:5672//")
RESULT_BACKEND = os.getenv("CELERY_RESULT_BACKEND", "rpc://")

celery_app = Celery(
    "kide_synthesis",
    broker=BROKER_URL,
    backend=RESULT_BACKEND,
    include=["kide_worker.tasks"],
)

celery_app.conf.update(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    task_track_started=True,
    broker_connection_retry_on_startup=True,
    worker_prefetch_multiplier=1,
)
