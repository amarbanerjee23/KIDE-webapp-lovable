import os
from urllib.parse import quote

from celery import Celery


def _broker_url() -> str:
    configured = os.getenv("CELERY_BROKER_URL")
    if configured:
        return configured

    username = quote(os.getenv("RABBITMQ_USERNAME", "kide"), safe="")
    password = quote(os.environ["RABBITMQ_PASSWORD"], safe="")
    host = os.getenv("RABBITMQ_HOST", "rabbitmq")
    port = os.getenv("RABBITMQ_PORT", "5672")
    return f"amqp://{username}:{password}@{host}:{port}//"


BROKER_URL = _broker_url()
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
