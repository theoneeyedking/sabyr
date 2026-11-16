from django.core.management.base import BaseCommand

from ledgerclient.models import KnownFlag
from risk.services import rebuild_passports


class Command(BaseCommand):
    help = "Пересчитывает паспорта получателей и графовые признаки (NetworkX) по истории переводов"

    def handle(self, *args, **opts):
        flagged = set(KnownFlag.objects.exclude(account=None).values_list("account_id", flat=True))
        self.stdout.write(str(rebuild_passports(flagged)))
