<button type="button" x-data x-on:click="$dispatch('open-cart')" class="label -mr-2 flex items-center gap-2 px-2 py-2 hover:text-ash"
        aria-label="Открыть корзину, товаров: {{ $count }}">
    Корзина
    <span class="grid h-5 min-w-5 place-items-center px-1 text-[11px] tabular-nums {{ $count ? 'bg-bone text-ink' : 'border border-line text-ash' }}">{{ $count }}</span>
</button>
