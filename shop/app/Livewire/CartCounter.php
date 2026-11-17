<?php

namespace App\Livewire;

use App\Services\Cart;
use Livewire\Attributes\On;
use Livewire\Component;

class CartCounter extends Component
{
    #[On('cart-updated')]
    public function refresh(): void {}

    public function render(Cart $cart)
    {
        return view('livewire.cart-counter', ['count' => $cart->count()]);
    }
}
