@props(['title' => null, 'overlayHeader' => false])
<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
    <meta name="theme-color" content="#0a0a0a">
    <title>{{ $title ? $title.' — BRAND' : 'BRAND — стритвир из Алматы' }}</title>
    <meta name="description" content="BRAND — стритвир из Алматы. Ограниченные дропы: куртки, худи, футболки, штаны.">
    @vite(['resources/css/app.css', 'resources/js/app.js'])
</head>
<body class="flex min-h-screen flex-col">
    <header class="fixed inset-x-0 top-0 z-40 border-b border-line bg-ink/90 backdrop-blur">
        <div class="flex h-14 items-center justify-between px-4 md:px-8">
            <a href="{{ route('home') }}" class="text-xl font-black uppercase tracking-[-0.04em]">Brand</a>
            <nav class="flex items-center gap-5 md:gap-8">
                <a href="{{ route('catalog') }}" class="label py-2 hover:text-ash">Каталог</a>
                <a href="{{ route('home') }}#drop" class="label hidden py-2 hover:text-ash sm:block">Дроп</a>
                <livewire:cart-counter />
            </nav>
        </div>
    </header>

    <main class="flex-1 {{ $overlayHeader ? '' : 'pt-14' }}">
        {{ $slot }}
    </main>

    <footer class="border-t border-line">
        <div class="grid grid-cols-1 gap-10 px-4 py-12 md:grid-cols-[2fr_1fr_1fr_1fr] md:px-8 md:py-16">
            <div>
                <p class="display text-5xl md:text-7xl">Brand</p>
                <p class="mt-4 max-w-xs text-sm text-ash">Стритвир из Алматы. Ограниченные дропы, сшито в Казахстане.</p>
            </div>
            <div>
                <p class="label text-ash">Магазин</p>
                <ul class="mt-4 space-y-3 text-sm">
                    <li><a class="hover:text-ash" href="{{ route('catalog') }}">Каталог</a></li>
                    <li><a class="hover:text-ash" href="{{ route('home') }}#drop">Текущий дроп</a></li>
                </ul>
            </div>
            <div>
                <p class="label text-ash">Покупателям</p>
                <ul class="mt-4 space-y-3 text-sm">
                    @foreach (config('shop.pages') as $slug => $page)
                        <li><a class="hover:text-ash" href="{{ route('info', $slug) }}">{{ $page['title'] }}</a></li>
                    @endforeach
                </ul>
            </div>
            <div>
                <p class="label text-ash">Соцсети</p>
                <ul class="mt-4 space-y-3 text-sm">
                    <li><a class="hover:text-ash" href="{{ config('shop.instagram') }}" target="_blank" rel="noopener">Instagram ↗</a></li>
                    <li><a class="hover:text-ash" href="{{ config('shop.tiktok') }}" target="_blank" rel="noopener">TikTok ↗</a></li>
                </ul>
            </div>
        </div>
        <div class="label flex justify-between border-t border-line px-4 py-5 text-ash md:px-8">
            <span>© {{ date('Y') }} Brand</span>
            <span>Алматы, Казахстан</span>
        </div>
    </footer>

    <livewire:cart-drawer />
</body>
</html>
