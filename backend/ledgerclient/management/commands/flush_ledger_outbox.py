from django.core.management.base import BaseCommand

from ledgerclient.service import flush_outbox


class Command(BaseCommand):
    help = "Повторно отправляет в реестр записи, которые не удалось записать сразу"

    def handle(self, *args, **opts):
        self.stdout.write(f"обработано записей: {flush_outbox()}")
