<?php

namespace App\Services;

use App\Models\ProductVariant;
use Illuminate\Support\Collection;

/**
 * Корзина в сессии: [variant_id => quantity].
 * Количество всегда ограничено текущим остатком размера.
 */
class Cart
{
    private const KEY = 'cart';

    private ?Collection $lines = null;

    /** @return array<int, int> */
    private function raw(): array
    {
        return session(self::KEY, []);
    }

    private function store(array $items): void
    {
        session([self::KEY => array_filter($items, fn ($qty) => $qty > 0)]);
        $this->lines = null;
    }

    /** Возвращает false, если добавить не получилось (нет остатка). */
    public function add(int $variantId, int $quantity = 1): bool
    {
        $variant = ProductVariant::find($variantId);
        $items = $this->raw();
        $current = $items[$variantId] ?? 0;

        if (! $variant || $variant->stock <= $current) {
            return false;
        }

        $items[$variantId] = min($current + $quantity, $variant->stock);
        $this->store($items);

        return true;
    }

    public function setQuantity(int $variantId, int $quantity): void
    {
        $items = $this->raw();

        if (! array_key_exists($variantId, $items)) {
            return;
        }

        $stock = ProductVariant::whereKey($variantId)->value('stock') ?? 0;
        $items[$variantId] = max(0, min($quantity, $stock));
        $this->store($items);
    }

    public function remove(int $variantId): void
    {
        $items = $this->raw();
        unset($items[$variantId]);
        $this->store($items);
    }

    public function clear(): void
    {
        session()->forget(self::KEY);
        $this->lines = null;
    }

    /**
     * Строки корзины с актуальными данными из БД.
     * Позиции, которых больше нет или которые закончились, отбрасываются.
     *
     * @return Collection<int, object{variant: ProductVariant, quantity: int, subtotal: int}>
     */
    public function lines(): Collection
    {
        if ($this->lines !== null) {
            return $this->lines;
        }

        $items = $this->raw();
        $variants = ProductVariant::with('product')->whereIn('id', array_keys($items))->get()->keyBy('id');

        return $this->lines = collect($items)
            ->map(function (int $qty, int $id) use ($variants) {
                $variant = $variants->get($id);
                if (! $variant || ! $variant->product?->is_active || $variant->stock < 1) {
                    return null;
                }
                $qty = min($qty, $variant->stock);

                return (object) [
                    'variant' => $variant,
                    'quantity' => $qty,
                    'subtotal' => $qty * $variant->product->price,
                ];
            })
            ->filter()
            ->values();
    }

    public function count(): int
    {
        return (int) $this->lines()->sum('quantity');
    }

    public function total(): int
    {
        return (int) $this->lines()->sum('subtotal');
    }

    public function isEmpty(): bool
    {
        return $this->lines()->isEmpty();
    }
}
