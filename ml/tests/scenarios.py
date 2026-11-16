"""Рукописные сценарии для проверки модели (используются в тестах и в отчёте)."""
from sabyr_ml import features as F

NOW = 1793000000 - (1793000000 % 86400) + 9 * 3600  # 14:00 по Алматы
DAY = 86400


def drop_passport(n=12, complaints=0):
    """Новый счёт: n входящих от разных людей за двое суток, вывод через 10 минут."""
    st = F.new_passport_state()
    for i in range(n):
        t = NOW - 2 * DAY + i * 7000
        F.passport_add_incoming(st, f"v{i}", t, 500_000)
        F.passport_add_outgoing(st, "cash", t + 600, 480_000)
    st["complaints"] = complaints
    return st


def friend_passport():
    """Обычный давний счёт: шесть знакомых, деньги приходят и тратятся без спешки."""
    st = F.new_passport_state()
    for i in range(30):
        t = NOW - DAY * (60 - i * 2)
        F.passport_add_incoming(st, f"f{i % 6}", t, 15_000)
        if i % 3 == 0:
            F.passport_add_outgoing(st, f"f{(i + 1) % 6}", t + DAY, 9_000)
    return st


def vector(*, amount, on_call=False, screen=False, new=True, prev=None, loan=None, sess=70, age=40,
           hour_shift=0, passport=None, opened_days=1500, ext=False, graph=None, flag=False):
    now = NOW + hour_shift * 3600
    f = F.sender_features(amount=amount, now=now, on_call=on_call, screen_share=screen, session_seconds=sess,
                          age=age, is_new_recipient=new, previous_amounts=prev or [20_000] * 10, last_loan=loan)
    f.update(F.passport_features(passport, None if opened_days is None else NOW - opened_days * DAY, NOW, ext, graph, flag))
    return f


SCENARIOS = {
    "gulnara_call_1.5M_new_drop": dict(amount=1_500_000, on_call=True, age=62, sess=40, passport=drop_passport(), opened_days=4),
    "same_without_call": dict(amount=1_500_000, age=62, passport=drop_passport(), opened_days=4),
    "call_1.5M_new_recipient_old_account": dict(amount=1_500_000, on_call=True, age=62, passport=friend_passport()),
    "call_loan_1.5M_old_account": dict(amount=1_500_000, on_call=True, age=62, loan=(NOW - 3600, 1_600_000), passport=friend_passport()),
    "call_1.5M_external_no_history": dict(amount=1_500_000, on_call=True, age=62, opened_days=None, ext=True),
    "friend_20k": dict(amount=20_000, new=False, passport=friend_passport()),
    "friend_20k_on_call": dict(amount=20_000, new=False, on_call=True, passport=friend_passport()),
    "big_purchase_600k_old_account": dict(amount=600_000, passport=friend_passport()),
    "aidos_50k_external_flagged": dict(amount=50_000, opened_days=None, ext=True, flag=True),
    "aidos_50k_external_clean": dict(amount=50_000, opened_days=None, ext=True),
    "shop_45k_new_with_complaints": dict(amount=45_000, passport=drop_passport(30, complaints=3), opened_days=12),
    "courier_9k_new_drop": dict(amount=9_000, sess=25, passport=drop_passport(), opened_days=6),
    "screen_share_400k_repeat_drop": dict(amount=400_000, screen=True, new=False, passport=drop_passport(), opened_days=8),
    "night_rush_200k_external": dict(amount=200_000, sess=15, hour_shift=-12, opened_days=None, ext=True),
    "screen_share_300k_old_account": dict(amount=300_000, screen=True, passport=friend_passport()),
}

if __name__ == "__main__":
    from sabyr_ml.scorer import RiskScorer
    sc = RiskScorer()
    for name, kw in SCENARIOS.items():
        r = sc.score(vector(**kw))
        print(f"{name:40s} score={r.score:3d} model={r.model_score:3d} {r.level:6s} {r.scheme}({r.scheme_confidence}) | "
              + "; ".join(x["code"] for x in r.reasons))
