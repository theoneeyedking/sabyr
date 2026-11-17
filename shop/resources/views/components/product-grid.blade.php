@props(['products'])
<div {{ $attributes->class('grid grid-cols-2 border-t border-line lg:grid-cols-4') }}>
    @foreach ($products as $product)
        <x-product-card :product="$product" wire:key="product-{{ $product->id }}" />
    @endforeach
</div>
