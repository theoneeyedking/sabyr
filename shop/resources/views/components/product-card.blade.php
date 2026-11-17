@props(['product'])
@php($soldOut = $product->isSoldOut())
<a href="{{ route('product', $product) }}" {{ $attributes->class("group block border-b border-r border-line") }}>
    <div class="relative aspect-[3/4] overflow-hidden bg-coal">
        @if ($product->coverUrl())
            <img src="{{ $product->coverUrl() }}" alt="{{ $product->name }}" loading="lazy"
                 class="h-full w-full object-cover {{ $soldOut ? 'opacity-40' : '' }}">
            @if ($product->hoverUrl() && ! $soldOut)
                <img src="{{ $product->hoverUrl() }}" alt="" loading="lazy" aria-hidden="true"
                     class="absolute inset-0 hidden h-full w-full object-cover opacity-0 transition-opacity duration-300 group-hover:opacity-100 lg:block">
            @endif
        @endif
        <div class="absolute left-0 top-0 flex flex-col items-start">
            @if ($soldOut)
                <span class="label bg-bone px-2 py-1.5 text-ink">Sold out</span>
            @elseif ($product->hasDiscount())
                <span class="label bg-bone px-2 py-1.5 text-ink">−{{ $product->discountPercent() }}%</span>
            @endif
        </div>
    </div>
    <div class="px-3 pb-5 pt-3 md:px-4">
        <h3 class="text-[12px] font-semibold uppercase leading-snug tracking-[0.06em] md:text-[13px]">{{ $product->name }}</h3>
        <p class="mt-1.5 flex flex-wrap items-baseline gap-x-2 text-[13px] {{ $soldOut ? 'text-ash' : '' }}">
            <span>{{ \App\Support\Money::format($product->price) }}</span>
            @if ($product->hasDiscount())
                <s class="text-ash">{{ \App\Support\Money::format($product->old_price) }}</s>
            @endif
        </p>
    </div>
</a>
