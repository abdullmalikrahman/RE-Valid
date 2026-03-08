from app.workers.celery_app import celery_app


@celery_app.task(name="validate_measurement")
def validate_measurement(measurement_id: int):
    """Run validation logic on a measurement record."""
    # TODO: implement validation
    return {"measurement_id": measurement_id, "status": "validated"}


@celery_app.task(name="generate_report")
def generate_report(report_params: dict):
    """Generate a report asynchronously."""
    # TODO: implement report generation
    return {"status": "report_generated"}
