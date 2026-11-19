from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("trusted", "0001_initial"),
    ]

    operations = [
        migrations.AlterField(
            model_name="trustedrequest",
            name="status",
            field=models.CharField(
                choices=[("pending", "Pending"), ("approved", "Approved"), ("declined", "Declined"), ("expired", "Expired")],
                db_index=True, default="pending", max_length=8),
        ),
    ]
