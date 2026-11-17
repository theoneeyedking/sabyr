@php
    [$dropTitle, $dropSubtitle] = array_pad(explode(' — ', $drop?->name ?? 'Brand', 2), 2, null);
@endphp
<x-layouts.shop :overlay-header="true">
    {{-- Hero: текущий дроп на весь экран --}}
    <section class="relative h-[100svh] min-h-[540px] overflow-hidden bg-coal">
        @if ($drop?->heroUrl())
            <img src="{{ $drop->heroUrl() }}" alt="" class="absolute inset-0 h-full w-full object-cover">
        @endif
        <div class="absolute inset-0 bg-ink/25"></div>
        <div class="absolute inset-x-0 bottom-0 px-4 pb-8 md:px-8 md:pb-12">
            @if ($drop?->tagline)
                <p class="label mb-4">Новый дроп · {{ $drop->tagline }}</p>
            @endif
            <h1 class="display text-[21vw] md:text-[13vw]">{{ $dropTitle }}</h1>
            <div class="mt-5 flex flex-col gap-5 md:mt-6 md:flex-row md:items-end md:justify-between">
                @if ($dropSubtitle)
                    <p class="display text-3xl md:text-5xl">{{ $dropSubtitle }}</p>
                @endif
                <a href="#drop" class="btn-solid w-full md:w-auto">Смотреть дроп <span aria-hidden="true">↓</span></a>
            </div>
        </div>
    </section>

    {{-- Товары коллекции --}}
    <section id="drop" class="scroll-mt-14">
        <div class="grid grid-cols-1 gap-6 px-4 py-12 md:grid-cols-2 md:px-8 md:py-20">
            <div>
                <p class="label text-ash">{{ $products->count() }} {{ \App\Support\Ru::plural($products->count(), 'позиция', 'позиции', 'позиций') }}</p>
                <h2 class="display mt-3 text-5xl md:text-7xl">{{ $drop?->name ?? 'Коллекция' }}</h2>
            </div>
            @if ($drop?->description)
                <p class="max-w-md self-end text-[15px] leading-relaxed text-ash md:justify-self-end">{{ $drop->description }}</p>
            @endif
        </div>
        <x-product-grid :products="$products" />
        <div class="px-4 py-10 text-center md:py-14">
            <a href="{{ route('catalog') }}" class="btn-outline w-full sm:w-auto">Весь каталог</a>
        </div>
    </section>

    {{-- Рассылка --}}
    <section class="border-t border-line">
        <div class="grid grid-cols-1 gap-8 px-4 py-16 md:grid-cols-2 md:items-end md:px-8 md:py-28">
            <div>
                <p class="label text-ash">Рассылка</p>
                <h2 class="display mt-3 text-5xl md:text-7xl">Узнавай о&nbsp;дропах первым</h2>
            </div>
            <livewire:newsletter-form />
        </div>
    </section>
</x-layouts.shop>
