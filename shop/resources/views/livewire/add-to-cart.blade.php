<div>
    <div class="flex items-baseline justify-between">
        <p class="label" id="size-label">Размер</p>
        <a href="#size-chart" class="text-xs text-ash underline underline-offset-4 hover:text-bone"
           x-data x-on:click="document.getElementById('size-chart')?.setAttribute('open', '')">Размерная сетка</a>
    </div>

    <div class="mt-3 grid grid-cols-4 gap-2" role="radiogroup" aria-labelledby="size-label">
        @foreach ($product->variants as $variant)
            @php($available = $variant->inStock())
            <button type="button" role="radio" wire:key="size-{{ $variant->id }}"
                    wire:click="select({{ $variant->id }})"
                    aria-checked="{{ $variantId === $variant->id ? 'true' : 'false' }}"
                    @disabled(! $available)
                    @if (! $available) title="Нет в наличии" aria-label="{{ $variant->size }} — нет в наличии" @endif
                    class="h-14 border text-sm font-bold uppercase tracking-wider transition-colors
                        {{ $variantId === $variant->id ? 'border-bone bg-bone text-ink' : '' }}
                        {{ $available && $variantId !== $variant->id ? 'border-line hover:border-bone' : '' }}
                        {{ ! $available ? 'cursor-not-allowed border-line/60 text-ash/40 line-through' : '' }}">
                {{ $variant->size }}
            </button>
        @endforeach
    </div>

    <div class="mt-3 min-h-5 text-[13px]">
        @if ($error)
            <p role="alert">— {{ $error }}</p>
        @elseif ($variantId && ($selected = $product->variants->firstWhere('id', $variantId)) && $selected->stock <= 3)
            <p class="text-ash">Осталось {{ $selected->stock }} шт.</p>
        @endif
    </div>

    @if ($soldOut)
        <button type="button" disabled class="btn-solid mt-3 w-full">Sold out</button>
    @else
        <button type="button" wire:click="add" wire:loading.attr="disabled" wire:target="add" class="btn-solid mt-3 w-full">
            В корзину
        </button>
    @endif
</div>
