<div x-data="{ open: false }"
     x-on:open-cart.window="open = true"
     x-on:keydown.escape.window="open = false"
     x-effect="document.documentElement.classList.toggle('overflow-hidden', open)">

    <div x-cloak x-show="open" x-transition.opacity.duration.200ms x-on:click="open = false"
         class="fixed inset-0 z-50 bg-black/70" aria-hidden="true"></div>

    <aside x-cloak x-show="open"
           x-transition:enter="transition duration-300 ease-out" x-transition:enter-start="translate-x-full"
           x-transition:leave="transition duration-200 ease-in" x-transition:leave-end="translate-x-full"
           class="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col border-l border-line bg-ink"
           role="dialog" aria-modal="true" aria-label="Корзина">

        <div class="flex h-14 shrink-0 items-center justify-between border-b border-line px-4 md:px-6">
            <p class="label">Корзина ({{ $count }})</p>
            <button type="button" x-on:click="open = false" class="label -mr-2 px-2 py-3 hover:text-ash">Закрыть ✕</button>
        </div>

        @if ($lines->isEmpty())
            <div class="flex flex-1 flex-col items-center justify-center gap-6 px-6 text-center">
                <p class="display text-4xl">Пусто</p>
                <p class="text-sm text-ash">Добавьте что-нибудь из каталога.</p>
                <a href="{{ route('catalog') }}" class="btn-outline">В каталог</a>
            </div>
        @else
            <ul class="flex-1 divide-y divide-line overflow-y-auto overscroll-contain">
                @foreach ($lines as $line)
                    @php($product = $line->variant->product)
                    <li wire:key="line-{{ $line->variant->id }}" class="flex gap-4 px-4 py-4 md:px-6">
                        <a href="{{ route('product', $product) }}" class="block h-28 w-[84px] shrink-0 bg-coal">
                            @if ($product->coverUrl())
                                <img src="{{ $product->coverUrl() }}" alt="" class="h-full w-full object-cover">
                            @endif
                        </a>
                        <div class="flex min-w-0 flex-1 flex-col">
                            <div class="flex items-start justify-between gap-3">
                                <a href="{{ route('product', $product) }}" class="text-[12px] font-semibold uppercase leading-snug tracking-[0.06em]">{{ $product->name }}</a>
                                <button type="button" wire:click="remove({{ $line->variant->id }})"
                                        class="-mr-2 -mt-2 shrink-0 p-2 text-ash hover:text-bone" aria-label="Удалить {{ $product->name }}">✕</button>
                            </div>
                            <p class="mt-1 text-[13px] text-ash">Размер {{ $line->variant->size }}</p>
                            <div class="mt-auto flex items-end justify-between">
                                <div class="flex h-10 items-center border border-line">
                                    <button type="button" wire:click="decrement({{ $line->variant->id }})"
                                            class="grid h-10 w-10 place-items-center hover:bg-coal" aria-label="Уменьшить количество">−</button>
                                    <span class="w-8 text-center text-sm tabular-nums" aria-live="polite">{{ $line->quantity }}</span>
                                    <button type="button" wire:click="increment({{ $line->variant->id }})"
                                            @disabled($line->quantity >= $line->variant->stock)
                                            class="grid h-10 w-10 place-items-center hover:bg-coal disabled:cursor-not-allowed disabled:text-line"
                                            aria-label="Увеличить количество">+</button>
                                </div>
                                <p class="text-sm tabular-nums">{{ \App\Support\Money::format($line->subtotal) }}</p>
                            </div>
                            @if ($line->quantity >= $line->variant->stock)
                                <p class="mt-2 text-xs text-ash">Это весь остаток размера</p>
                            @endif
                        </div>
                    </li>
                @endforeach
            </ul>

            <div class="shrink-0 border-t border-line px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4 md:px-6">
                <div class="flex items-baseline justify-between">
                    <p class="label">Итого</p>
                    <p class="text-xl font-bold tabular-nums">{{ \App\Support\Money::format($total) }}</p>
                </div>
                <p class="mt-1 text-xs text-ash">Доставка рассчитывается после оформления.</p>
                <a href="{{ route('checkout') }}" class="btn-solid mt-4 w-full">Оформить заказ</a>
            </div>
        @endif
    </aside>
</div>
