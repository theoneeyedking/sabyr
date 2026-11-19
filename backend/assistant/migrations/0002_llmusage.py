from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("assistant", "0001_initial"),
    ]

    operations = [
        migrations.CreateModel(
            name="LLMUsage",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("day", models.DateField(unique=True)),
                ("calls", models.PositiveIntegerField(default=0)),
            ],
        ),
    ]
