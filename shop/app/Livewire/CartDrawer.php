<?php

namespace App\Livewire;

use App\Services\Cart;
use Livewire\Attributes\On;
use Livewire\Component;

class CartDrawer extends Component
{
    #[On('cart-updated')]
    public function refresh(): void {}

    public function increment(int $variantId, Cart $cart): void
    {
        $line = $cart->lines()->firstWhere('variant.id', $variantId);
        if ($line) {
            $cart->setQuantity($variantId, $line->quantity + 1);
        }
        $this->dispatch('cart-updated');
    }

    public function decrement(int $variantId, Cart $cart): void
    {
        $line = $cart->lines()->firstWhere('variant.id', $variantId);
        if ($line) {
            $cart->setQuantity($variantId, $line->quantity - 1);
        }
        $this->dispatch('cart-updated');
    }

    public function remove(int $variantId, Cart $cart): void
    {
        $cart->remove($variantId);
        $this->dispatch('cart-updated');
    }

    public function render(Cart $cart)
    {
        return view('livewire.cart-drawer', [
            'lines' => $cart->lines(),
            'total' => $cart->total(),
            'count' => $cart->count(),
        ]);
    }
}
