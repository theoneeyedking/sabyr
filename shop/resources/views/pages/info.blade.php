<x-layouts.shop :title="$title">
    <div class="px-4 py-12 md:px-8 md:py-20">
        <h1 class="display max-w-4xl text-4xl md:text-7xl">{{ $title }}</h1>
        <div class="mt-8 max-w-xl space-y-4 text-[15px] leading-relaxed text-ash">
            @foreach ($body as $paragraph)
                <p>{{ $paragraph }}</p>
            @endforeach
        </div>
    </div>
</x-layouts.shop>
