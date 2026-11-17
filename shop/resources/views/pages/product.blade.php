@php($images = $product->imageUrls())
<x-layouts.shop :title="$product->name">
    <div class="lg:grid lg:grid-cols-[minmax(0,1fr)_440px] xl:grid-cols-[minmax(0,1fr)_520px]">
        {{-- Галерея: свайп на мобильном, сетка на десктопе --}}
        <div x-data="{ i: 0 }" class="relative lg:border-r lg:border-line">
            <div x-ref="track"
                 x-on:scroll.passive="i = Math.round($refs.track.scrollLeft / $refs.track.clientWidth)"
                 class="no-scrollbar flex snap-x snap-mandatory overflow-x-auto lg:grid lg:grid-cols-2 lg:gap-px lg:overflow-visible lg:bg-line">
                @forelse ($images as $n => $url)
                    <div class="aspect-[3/4] w-full shrink-0 snap-center bg-coal {{ $n === 0 && count($images) % 2 === 1 ? 'lg:col-span-2' : '' }}">
                        <img src="{{ $url }}" alt="{{ $product->name }} — фото {{ $n + 1 }}"
                             class="h-full w-full object-cover" @if ($n > 0) loading="lazy" @endif>
                    </div>
                @empty
                    <div class="aspect-[3/4] w-full bg-coal"></div>
                @endforelse
            </div>
            @if (count($images) > 1)
                <div class="label pointer-events-none absolute bottom-3 right-3 bg-ink/80 px-2 py-1 tabular-nums lg:hidden">
                    <span x-text="i + 1">1</span> / {{ count($images) }}
                </div>
            @endif
        </div>

        {{-- Информация --}}
        <div class="px-4 py-8 md:px-8 lg:sticky lg:top-14 lg:max-h-[calc(100vh-3.5rem)] lg:self-start lg:overflow-y-auto lg:py-12">
            <nav class="label flex flex-wrap gap-x-2 text-ash" aria-label="Хлебные крошки">
                <a href="{{ route('catalog') }}" class="hover:text-bone">Каталог</a><span>/</span>
                <a href="{{ route('catalog', ['category' => $product->category->slug]) }}" class="hover:text-bone">{{ $product->category->name }}</a>
            </nav>

            <h1 class="display mt-4 text-4xl md:text-5xl">{{ $product->name }}</h1>

            <p class="mt-5 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span class="text-2xl font-bold tabular-nums">{{ \App\Support\Money::format($product->price) }}</span>
                @if ($product->hasDiscount())
                    <s class="text-lg tabular-nums text-ash">{{ \App\Support\Money::format($product->old_price) }}</s>
                    <span class="label bg-bone px-2 py-1 text-ink">−{{ $product->discountPercent() }}%</span>
                @endif
            </p>

            <div class="mt-8">
                <livewire:add-to-cart :product="$product" />
            </div>

            <div class="mt-10 divide-y divide-line border-y border-line">
                @if ($product->description)
                    <details open class="group">
                        <summary class="label flex cursor-pointer list-none items-center justify-between py-4">Описание <span class="group-open:rotate-45">+</span></summary>
                        <div class="pb-5 text-[15px] leading-relaxed text-ash">
                            <p>{{ $product->description }}</p>
                            @if ($product->composition)
                                <p class="mt-3">Состав: {{ $product->composition }}</p>
                            @endif
                            @if ($product->collection)
                                <p class="mt-3">Коллекция: {{ $product->collection->name }}</p>
                            @endif
                        </div>
                    </details>
                @endif

                @if ($sizeChart)
                    <details class="group" id="size-chart">
                        <summary class="label flex cursor-pointer list-none items-center justify-between py-4">Размерная сетка <span class="group-open:rotate-45">+</span></summary>
                        <div class="pb-5">
                            <table class="w-full text-left text-sm tabular-nums">
                                <thead>
                                    <tr class="label text-ash">
                                        @foreach ($sizeChart['columns'] as $col)
                                            <th scope="col" class="border-b border-line py-2 font-semibold">{{ $col }}</th>
                                        @endforeach
                                    </tr>
                                </thead>
                                <tbody>
                                    @foreach ($sizeChart['rows'] as $row)
                                        <tr>
                                            @foreach ($row as $n => $cell)
                                                <td class="border-b border-line py-2.5 {{ $n === 0 ? 'font-bold' : 'text-ash' }}">{{ $cell }}</td>
                                            @endforeach
                                        </tr>
                                    @endforeach
                                </tbody>
                            </table>
                            <p class="mt-3 text-xs text-ash">Замеры изделия в сантиметрах. Крой свободный — берите свой обычный размер.</p>
                        </div>
                    </details>
                @endif

                <details class="group">
                    <summary class="label flex cursor-pointer list-none items-center justify-between py-4">Доставка и возврат <span class="group-open:rotate-45">+</span></summary>
                    <div class="pb-5 text-[15px] leading-relaxed text-ash">
                        <p>Курьер по Алматы — 1–2 дня, по Казахстану — 3–7 дней. Возврат и обмен в течение 14 дней.</p>
                    </div>
                </details>
            </div>
        </div>
    </div>

    @if ($related->isNotEmpty())
        <section class="border-t border-line">
            <h2 class="display px-4 py-10 text-4xl md:px-8 md:py-14 md:text-6xl">Ещё {{ mb_strtolower($product->category->name) }}</h2>
            <x-product-grid :products="$related" />
        </section>
    @endif
</x-layouts.shop>
