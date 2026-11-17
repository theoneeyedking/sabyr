<div>
    <div class="px-4 pt-10 md:px-8 md:pt-16">
        <h1 class="display text-6xl md:text-9xl">Каталог</h1>
    </div>

    <div class="sticky top-14 z-30 mt-6 border-y border-line bg-ink/95 backdrop-blur md:mt-10">
        <div class="no-scrollbar flex items-center gap-1 overflow-x-auto px-2 md:px-6" role="tablist" aria-label="Категории">
            @php($tabs = collect([['' , 'Всё']])->concat($categories->map(fn ($c) => [$c->slug, $c->name])))
            @foreach ($tabs as [$slug, $name])
                <button type="button" role="tab" wire:click="setCategory('{{ $slug }}')"
                        aria-selected="{{ $category === $slug ? 'true' : 'false' }}"
                        class="label shrink-0 px-2 py-4 transition-colors {{ $category === $slug ? 'text-bone underline decoration-2 underline-offset-8' : 'text-ash hover:text-bone' }}">
                    {{ $name }}
                </button>
            @endforeach
            <span class="label ml-auto shrink-0 pl-4 pr-2 text-ash">{{ $products->count() }}</span>
        </div>
    </div>

    <div wire:loading.class="opacity-40" class="transition-opacity">
        @if ($products->isEmpty())
            <p class="px-4 py-24 text-center text-ash md:px-8">В этой категории пока ничего нет.</p>
        @else
            <x-product-grid :products="$products" class="!border-t-0" />
        @endif
    </div>
</div>
