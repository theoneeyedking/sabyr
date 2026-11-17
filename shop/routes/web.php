<?php

use App\Models\Collection;
use App\Models\Order;
use App\Models\Product;
use Illuminate\Support\Facades\Route;

Route::get('/', function () {
    $drop = Collection::current();
    $products = $drop
        ? $drop->products()->active()->with('variants')->orderBy('sort')->get()
        : collect();

    return view('pages.home', compact('drop', 'products'));
})->name('home');

Route::view('/catalog', 'pages.catalog')->name('catalog');

Route::get('/product/{product:slug}', function (Product $product) {
    abort_unless($product->is_active, 404);
    $product->load(['variants', 'category', 'collection']);

    $related = Product::active()->with('variants')
        ->where('category_id', $product->category_id)
        ->whereKeyNot($product->id)
        ->orderBy('sort')->limit(4)->get();

    return view('pages.product', [
        'product' => $product,
        'related' => $related,
        'sizeChart' => config('shop.size_charts.'.$product->category->slug),
    ]);
})->name('product');

Route::view('/checkout', 'pages.checkout')->name('checkout');

Route::get('/checkout/thanks/{order}', function (Order $order) {
    return view('pages.thanks', ['order' => $order->load('items')]);
})->name('checkout.thanks');

Route::get('/info/{page}', function (string $page) {
    $content = config("shop.pages.$page");
    abort_unless($content, 404);

    return view('pages.info', $content);
})->name('info');
