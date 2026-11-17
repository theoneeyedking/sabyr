<x-layouts.shop title="Спасибо за заказ">
    <div class="px-4 py-12 md:px-8 md:py-20">
        <p class="label text-ash">Заказ {{ $order->number }}</p>
        <h1 class="display mt-4 text-[19vw] md:text-[12vw]">Спасибо</h1>
        <p class="mt-6 max-w-md text-[15px] leading-relaxed text-ash">
            Заказ принят. Мы свяжемся с вами по телефону, чтобы подтвердить детали и оплату.
        </p>

        <dl class="mt-10 max-w-xl divide-y divide-line border-y border-line text-sm">
            <div class="flex justify-between gap-6 py-3.5">
                <dt class="label text-ash">Статус</dt>
                <dd class="text-right">{{ $order->status->label() }}</dd>
            </div>
            <div class="flex justify-between gap-6 py-3.5">
                <dt class="label text-ash">Доставка</dt>
                <dd class="text-right">{{ $order->delivery_method->label() }}</dd>
            </div>
            @foreach ($order->items as $item)
                <div class="flex justify-between gap-6 py-3.5">
                    <dt>{{ $item->product_name }} <span class="text-ash">· {{ $item->size }} · {{ $item->quantity }} шт.</span></dt>
                    <dd class="shrink-0 tabular-nums">{{ \App\Support\Money::format($item->subtotal()) }}</dd>
                </div>
            @endforeach
            <div class="flex items-baseline justify-between gap-6 py-4">
                <dt class="label">Итого</dt>
                <dd class="text-xl font-bold tabular-nums">{{ \App\Support\Money::format($order->total) }}</dd>
            </div>
        </dl>

        <a href="{{ route('catalog') }}" class="btn-outline mt-10 w-full sm:w-auto">Вернуться в каталог</a>
    </div>
</x-layouts.shop>
