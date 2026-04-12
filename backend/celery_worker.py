"""
Celery worker entrypoint untuk RE-Valid.

Jalankan dari folder backend/:
    python -m celery -A celery_worker.celery_app worker --loglevel=info --pool=solo

Catatan: --pool=solo dipakai di Windows karena Windows tidak mendukung fork.
"""
import sys
import os

# Pastikan folder backend ada di sys.path saat dijalankan langsung
sys.path.insert(0, os.path.dirname(__file__))

from app.workers.celery_app import celery_app  # noqa: F401 — re-export for -A flag
import app.workers.tasks  # noqa: F401 — register all tasks
