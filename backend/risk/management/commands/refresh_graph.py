from django.core.management.base import BaseCommand

from risk.services import refresh_graph


class Command(BaseCommand):
    help = "Пересчитывает графовые признаки паспортов (степень, PageRank, близость к дропам); годится для cron"

    def handle(self, *args, **opts):
        self.stdout.write(str(refresh_graph()))
