<div>
    <div class="px-4 pt-10 md:px-8 md:pt-16">
        <h1 class="display text-5xl md:text-8xl">Оформление</h1>
    </div>

    @if ($lines->isEmpty())
        <div class="px-4 py-20 md:px-8">
            <p class="text-ash">В корзине пока ничего нет.</p>
            <a href="{{ route('catalog') }}" class="btn-outline mt-6">В каталог</a>
        </div>
    @else
        <div class="mt-8 border-t border-line lg:mt-12 lg:grid lg:grid-cols-[minmax(0,1fr)_440px]">
            {{-- Состав заказа --}}
            <aside class="border-b border-line px-4 py-6 md:px-8 lg:order-2 lg:border-b-0 lg:border-l lg:py-10">
                <p class="label text-ash">Ваш заказ</p>
                <ul class="mt-4 divide-y divide-line">
                    @foreach ($lines as $line)
                        @php($product = $line->variant->product)
                        <li class="flex gap-4 py-3" wire:key="sum-{{ $line->variant->id }}">
                            <div class="h-20 w-[60px] shrink-0 bg-coal">
                                @if ($product->coverUrl())
                                    <img src="{{ $product->coverUrl() }}" alt="" class="h-full w-full object-cover">
                                @endif
                            </div>
                            <div class="min-w-0 flex-1">
                                <p class="text-[12px] font-semibold uppercase leading-snug tracking-[0.06em]">{{ $product->name }}</p>
                                <p class="mt-1 text-[13px] text-ash">Размер {{ $line->variant->size }} · {{ $line->quantity }} шт.</p>
                            </div>
                            <p class="shrink-0 text-sm tabular-nums">{{ \App\Support\Money::format($line->subtotal) }}</p>
                        </li>
                    @endforeach
                </ul>
                <div class="mt-4 flex items-baseline justify-between border-t border-line pt-4">
                    <p class="label">Итого</p>
                    <p class="text-xl font-bold tabular-nums">{{ \App\Support\Money::format($total) }}</p>
                </div>
                <p class="mt-1 text-xs text-ash">Стоимость доставки менеджер сообщит при подтверждении заказа.</p>
            </aside>

            {{-- Форма --}}
            <form wire:submit="pay" novalidate class="px-4 py-8 md:px-8 lg:order-1 lg:py-10">
                <div class="max-w-xl space-y-6">
                    <p class="label text-ash">Контакты</p>
                    <div>
                        <label for="co-name" class="label">Имя</label>
                        <input id="co-name" type="text" wire:model.blur="name" autocomplete="name" class="field" placeholder="Как к вам обращаться">
                        @error('name') <p class="mt-2 text-[13px]" role="alert">— {{ $message }}</p> @enderror
                    </div>
                    <div>
                        <label for="co-phone" class="label">Телефон</label>
                        <input id="co-phone" type="tel" inputmode="tel" wire:model.blur="phone" autocomplete="tel" class="field" placeholder="+7 700 000 00 00">
                        @error('phone') <p class="mt-2 text-[13px]" role="alert">— {{ $message }}</p> @enderror
                    </div>

                    <p class="label pt-6 text-ash">Доставка</p>
                    <fieldset>
                        <legend class="sr-only">Способ доставки</legend>
                        <div class="grid gap-2">
                            @foreach ($methods as $method)
                                <label class="flex cursor-pointer items-center gap-4 border px-4 py-3.5 transition-colors {{ $delivery === $method->value ? 'border-bone' : 'border-line hover:border-ash' }}">
                                    <input type="radio" wire:model.live="delivery" value="{{ $method->value }}" class="peer sr-only">
                                    <span class="grid h-4 w-4 shrink-0 place-items-center border border-bone peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-bone">
                                        <span class="h-2 w-2 {{ $delivery === $method->value ? 'bg-bone' : '' }}"></span>
                                    </span>
                                    <span class="min-w-0">
                                        <span class="block text-sm font-semibold">{{ $method->label() }}</span>
                                        <span class="block text-[13px] text-ash">{{ $method->hint() }}</span>
                                    </span>
                                </label>
                            @endforeach
                        </div>
                        @error('delivery') <p class="mt-2 text-[13px]" role="alert">— {{ $message }}</p> @enderror
                    </fieldset>
                    <div>
                        <label for="co-city" class="label">Город</label>
                        <input id="co-city" type="text" wire:model.blur="city" autocomplete="address-level2" class="field">
                        @error('city') <p class="mt-2 text-[13px]" role="alert">— {{ $message }}</p> @enderror
                    </div>
                    <div>
                        <label for="co-address" class="label">Адрес</label>
                        <input id="co-address" type="text" wire:model.blur="address" autocomplete="street-address" class="field" placeholder="Улица, дом, квартира">
                        @error('address') <p class="mt-2 text-[13px]" role="alert">— {{ $message }}</p> @enderror
                    </div>

                    @error('cart') <p class="text-[13px]" role="alert">— {{ $message }}</p> @enderror

                    <div class="pt-4">
                        <button type="submit" class="btn-solid w-full" wire:loading.attr="disabled" wire:target="pay">
                            <span wire:loading.remove wire:target="pay">Оплатить · {{ \App\Support\Money::format($total) }}</span>
                            <span wire:loading wire:target="pay">Оформляем…</span>
                        </button>
                        <p class="mt-3 text-xs text-ash">Демо-режим: деньги не списываются, заказ создаётся со статусом «Ожидает оплаты».</p>
                    </div>
                </div>
            </form>
        </div>
    @endif
</div>
