"""Проверяем, что генератор действительно закладывает в данные нужные мошеннические схемы."""
import numpy as np
import pytest

from sabyr_ml import datagen
from sabyr_ml.datagen import Config, DAY, SCHEMES


@pytest.fixture(scope="module")
def data():
    return datagen.generate(Config(n_clients=600, n_transfers=24_000, seed=7))


def test_volume_and_labels(data):
    t = data["transfers"]
    assert len(data["clients"]) == 600
    assert 20_000 <= len(t) <= 24_000
    assert set(t.is_fraud.unique()) == {0, 1}
    assert 0.01 < t.is_fraud.mean() < 0.15
    fraud = t[t.kind == "fraud"]
    assert set(fraud.scheme.unique()) == set(SCHEMES)
    assert (t[t.is_fraud == 0].scheme == "").all()
    assert round((t.ts.max() - t.ts.min()) / DAY) == 90


def test_deterministic():
    a = datagen.generate(Config(n_clients=300, n_transfers=5000, seed=1))["transfers"]
    b = datagen.generate(Config(n_clients=300, n_transfers=5000, seed=1))["transfers"]
    assert a.equals(b)


def test_drop_accounts_are_new_with_many_unrelated_senders_and_fast_cashout(data):
    t, acc = data["transfers"], data["accounts"].set_index("account_id")
    drops = acc[acc.kind == "drop"].index
    assert len(drops) >= 4
    inc = t[t.recipient_id.isin(drops) & (t.kind == "fraud")]
    first_in = inc.groupby("recipient_id").ts.min()
    age_days = (first_in - acc.opened_ts[first_in.index]) / DAY
    assert age_days.max() <= 26 and age_days.median() < 16          # счёт открыт недавно
    assert inc.groupby("recipient_id").sender_id.nunique().median() >= 8  # много несвязанных отправителей
    outs = t[t.sender_id.isin(drops) & (t.kind == "cashout")]
    assert len(outs) > 0
    # для каждого вывода ближайшее предшествующее поступление было не более 30 минут назад
    for r in outs.head(50).itertuples():
        prev = inc[(inc.recipient_id == r.sender_id) & (inc.ts <= r.ts)].ts.max()
        assert r.ts - prev <= 30 * 60


def test_fake_shops_get_burst_then_complaints(data):
    t, acc, comp = data["transfers"], data["accounts"], data["complaints"]
    shops = acc[acc.kind.isin(["fake_shop", "ext_fake_shop"])].account_id
    for s in shops:
        pays = t[(t.recipient_id == s) & (t.kind == "fraud")]
        assert len(pays) >= 30
        assert (pays.scheme == "fake_shop").all()
        assert pays.sender_id.nunique() / len(pays) > 0.8          # почти все плательщики новые
        c = comp[comp.account_id == s]
        assert len(c) >= 5
        assert c.ts.min() >= pays.ts.min() + 2 * DAY                 # жалобы приходят позже платежей


def test_victims_have_signals_and_loans(data):
    t, loans = data["transfers"], data["loans"]
    safe = t[(t.kind == "fraud") & (t.scheme == "safe_account")]
    legit = t[t.kind == "p2p"]
    assert safe.on_call.mean() > 0.7 > 0.1 > legit.on_call.mean()
    assert safe.amount.median() > 20 * legit.amount.median()        # нетипично крупная сумма
    # у заметной доли жертв перед переводом оформлен кредит на близкую сумму
    last = loans.sort_values("ts").groupby("client_id").tail(1).set_index("client_id")
    j = safe.merge(last, left_on="sender_id", right_index=True, suffixes=("", "_loan"))
    near = j[(j.ts - j.ts_loan).between(0, 6 * 3600) & (j.amount / j.amount_loan).between(0.75, 1.01)]
    assert len(near) / len(safe) > 0.2


def test_no_real_personal_data(data):
    assert data["clients"].phone.str.startswith("+7700").all()   # несуществующий диапазон
    assert data["accounts"].number.str.match(r"^KZ\d{2}SB[AB]\d{13}$").all()
    assert np.isnan(data["accounts"][data["accounts"].bank == "B"].opened_ts).all()
