"""Готовит все данные для демо-сценария Sabyr.

  python manage.py seed_demo            # ~1 000 синтетических клиентов, быстро
  python manage.py seed_demo --full     # все 5 000 клиентов и 200 000 переводов

Создаёт два банка, синтетическую историю переводов (фон для паспортов и графа) и героев сценария:
Гульнара Сейткали (62 года, Банк А), её сын Данияр Сейткали (доверенное лицо), Айдос Нурланов (Банк Б)
и свежий дроп-счёт в Банке А.
"""
from datetime import datetime, timedelta, timezone as dt_tz
from decimal import Decimal

import numpy as np
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils import timezone

from assistant.models import AssistantMessage
from bank.models import Account, Bank, Client, Complaint, Loan, Transfer
from ledgerclient.models import KnownFlag, LedgerOutbox, WarningEvidence
from risk import services as risk
from risk.models import RecipientPassport
from sabyr_ml import datagen
from trusted.models import TrustedContact, TrustedRequest

DROP_ACCOUNT = "KZ11SBA0000000007777"
FRIEND_ACCOUNT = "KZ22SBA0000000001111"
GULNARA_ACCOUNT = "KZ33SBA0000000000062"
DANIYAR_ACCOUNT = "KZ44SBA0000000000035"
AIDOS_ACCOUNT = "KZ55SBB0000000000034"


def _dt(ts: float) -> datetime:
    return datetime.fromtimestamp(float(ts), tz=dt_tz.utc)


class Command(BaseCommand):
    help = "Готовит данные для демо-сценария (Гульнара, Данияр, Айдос, дроп-счёт)"

    def add_arguments(self, parser):
        parser.add_argument("--clients", type=int, default=1000)
        parser.add_argument("--transfers", type=int, default=40_000)
        parser.add_argument("--full", action="store_true", help="5 000 клиентов и 200 000 переводов")
        parser.add_argument("--seed", type=int, default=42)

    @transaction.atomic
    def handle(self, *args, **opts):
        if opts["full"]:
            opts["clients"], opts["transfers"] = 5000, 200_000
        now = timezone.now()
        self.stdout.write("Очищаю таблицы…")
        for model in (AssistantMessage, TrustedRequest, TrustedContact, WarningEvidence, LedgerOutbox, KnownFlag,
                      RecipientPassport, Transfer, Loan, Complaint, Account, Client, Bank):
            model.objects.all().delete()

        bank_a = Bank.objects.create(code="A", name="Банк А", msp_id="Org1MSP")
        bank_b = Bank.objects.create(code="B", name="Банк Б", msp_id="Org2MSP")

        # ---------------------------------------------------------------- синтетический фон
        self.stdout.write(f"Генерирую синтетику: {opts['clients']} клиентов, {opts['transfers']} переводов…")
        end_ts = int((now - timedelta(hours=1)).timestamp())
        data = datagen.generate(datagen.Config(n_clients=opts["clients"], n_transfers=opts["transfers"],
                                               seed=opts["seed"], end_ts=end_ts))
        rng = np.random.default_rng(opts["seed"])
        clients = Client.objects.bulk_create([
            Client(bank=bank_a, full_name=r.full_name, age=int(r.age), phone=r.phone, lang=r.lang)
            for r in data["clients"].itertuples()], batch_size=2000)
        owner_of = {int(r.account_id): c for r, c in zip(data["clients"].itertuples(), clients)}
        start_ts = end_ts - 90 * 86400
        accounts = Account.objects.bulk_create([
            Account(number=r.number, bank=bank_a if r.bank == "A" else bank_b, owner=owner_of.get(int(r.account_id)),
                    display_name=r.display_name,
                    opened_at=_dt(r.opened_ts if r.opened_ts == r.opened_ts else start_ts - 400 * 86400),
                    balance=Decimal(int(rng.integers(50, 2000)) * 1000))
            for r in data["accounts"].itertuples()], batch_size=2000)
        acc = {int(r.account_id): a for r, a in zip(data["accounts"].itertuples(), accounts)}
        Transfer.objects.bulk_create([
            Transfer(sender_account=acc[int(r.sender_id)], recipient_account=acc[int(r.recipient_id)],
                     amount=Decimal(str(r.amount)), created_at=_dt(r.ts), completed_at=_dt(r.ts),
                     status=Transfer.Status.CONFIRMED, scheme=r.scheme, is_fraud_label=bool(r.is_fraud),
                     signals={"on_call": bool(r.on_call), "screen_share": bool(r.screen_share),
                              "session_seconds": float(r.session_seconds)})
            for r in data["transfers"].itertuples()], batch_size=5000)
        Loan.objects.bulk_create([Loan(client=owner_of[int(r.client_id)], amount=Decimal(str(r.amount)), issued_at=_dt(r.ts))
                                  for r in data["loans"].itertuples()], batch_size=5000)
        Complaint.objects.bulk_create([Complaint(account=acc[int(r.account_id)], created_at=_dt(r.ts))
                                       for r in data["complaints"].itertuples()], batch_size=5000)
        regular = [acc[int(i)] for i in data["clients"][data["clients"].kind == "regular"].account_id[:60]]
        external = [acc[int(i)] for i in data["accounts"][data["accounts"].kind == "ext_regular"].account_id[:20]]
        cashout = acc[int(data["accounts"][data["accounts"].kind == "ext_cashout"].account_id.iloc[0])]

        # ---------------------------------------------------------------- герои сценария
        def person(bank, name, age, phone, lang, number, balance, opened_days):
            c = Client.objects.create(bank=bank, full_name=name, age=age, phone=phone, lang=lang, is_demo=True)
            a = Account.objects.create(number=number, bank=bank, owner=c, display_name=name,
                                       opened_at=now - timedelta(days=opened_days), balance=Decimal(balance))
            return c, a

        gulnara, g_acc = person(bank_a, "Гульнара Сейткали", 62, "+77000000062", "kz", GULNARA_ACCOUNT, 2_300_000, 2900)
        daniyar, d_acc = person(bank_a, "Данияр Сейткали", 35, "+77000000035", "kz", DANIYAR_ACCOUNT, 640_000, 2100)
        aidos, a_acc = person(bank_b, "Айдос Нурланов", 34, "+77000000034", "ru", AIDOS_ACCOUNT, 870_000, 1500)
        TrustedContact.objects.create(client=gulnara, trusted=daniyar, relation="son")

        friend_owner = Client.objects.create(bank=bank_a, full_name="Сауле Ахметова", age=59, phone="+77000000059", lang="kz")
        friend = Account.objects.create(number=FRIEND_ACCOUNT, bank=bank_a, owner=friend_owner, display_name="Сауле Ахметова",
                                        opened_at=now - timedelta(days=1800), balance=Decimal(310_000))
        drop_owner = Client.objects.create(bank=bank_a, full_name="Ерлан Абенов", age=23, phone="+77000000023", lang="ru")
        drop = Account.objects.create(number=DROP_ACCOUNT, bank=bank_a, owner=drop_owner, display_name="Ерлан Абенов",
                                      opened_at=now - timedelta(days=4), balance=Decimal(18_000))

        history = []

        def add(sender, recipient, amount, when):
            history.append(Transfer(sender_account=sender, recipient_account=recipient, amount=Decimal(amount),
                                    created_at=when, completed_at=when, status=Transfer.Status.CONFIRMED,
                                    signals={"on_call": False, "screen_share": False, "session_seconds": 80.0}))

        # обычная жизнь Гульнары: небольшие переводы знакомым и сыну, пенсия раз в месяц
        g_contacts = [friend, d_acc, regular[0], regular[1]]
        for i in range(26):
            when = now - timedelta(days=58 - i * 2.2, hours=float(rng.uniform(-4, 4)))
            add(g_acc, g_contacts[i % 4], int(rng.integers(5, 31)) * 1000, when)
        for m in range(3):
            add(external[0], g_acc, 186_000, now - timedelta(days=75 - m * 30))
        for i in range(8):
            add(regular[2 + i % 3], friend, int(rng.integers(8, 25)) * 1000, now - timedelta(days=50 - i * 6))
            add(friend, regular[2 + i % 3], int(rng.integers(5, 15)) * 1000, now - timedelta(days=49 - i * 6))
        # Данияр и Айдос
        for i in range(15):
            add(d_acc, regular[5 + i % 5], int(rng.integers(10, 80)) * 1000, now - timedelta(days=45 - i * 3))
            add(a_acc, external[1 + i % 6], int(rng.integers(8, 60)) * 1000, now - timedelta(days=44 - i * 3))
        add(d_acc, g_acc, 50_000, now - timedelta(days=20))
        # дроп: за двое суток 12 входящих от не связанных людей, вывод через ~10 минут
        for i in range(12):
            when = now - timedelta(hours=46 - i * 3.7)
            amount = int(rng.integers(150, 900)) * 1000
            add(regular[20 + i], drop, amount, when)
            add(drop, cashout, int(amount * 0.97), when + timedelta(minutes=float(rng.uniform(4, 16))))
        Transfer.objects.bulk_create(history)

        self.stdout.write("Пересчитываю паспорта получателей и граф…")
        stats = risk.rebuild_passports()

        # ---------------------------------------------------------------- самопроверка сценария
        result, _ = risk.score_transfer(gulnara, g_acc, drop, Decimal(1_500_000),
                                        {"on_call": True, "screen_share": False, "session_seconds": 45}, timezone.now(), False)
        calm, _ = risk.score_transfer(gulnara, g_acc, friend, Decimal(20_000),
                                      {"on_call": False, "screen_share": False, "session_seconds": 80}, timezone.now(), False)
        if result.level != "high" or calm.level != "low":
            raise CommandError(f"Сценарий не воспроизводится: риск дроп-перевода {result.score}, обычного {calm.score}")

        self.stdout.write(self.style.SUCCESS(
            f"Готово: клиентов {Client.objects.count()}, счетов {Account.objects.count()}, "
            f"переводов {Transfer.objects.count()}, паспортов {stats['passports']}"))
        self.stdout.write(
            "\nГерои демо:\n"
            f"  Гульнара Сейткали (62, Банк А, kz)  счёт {GULNARA_ACCOUNT}, доверенное лицо — Данияр\n"
            f"  Данияр Сейткали  (35, Банк А)       счёт {DANIYAR_ACCOUNT}\n"
            f"  Айдос Нурланов   (34, Банк Б, ru)   счёт {AIDOS_ACCOUNT}\n"
            f"Счета для перевода:\n"
            f"  дроп-счёт (новый, Банк А):          {DROP_ACCOUNT}\n"
            f"  знакомая Гульнары (обычный счёт):   {FRIEND_ACCOUNT}\n"
            f"Самопроверка: Гульнара → дроп 1 500 000 ₸ во время звонка: риск {result.score} "
            f"(схема {result.scheme}); перевод знакомой 20 000 ₸: риск {calm.score}")
