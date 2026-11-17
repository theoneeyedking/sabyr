<?php

namespace App\Livewire;

use App\Models\Product;
use App\Services\Cart;
use Livewire\Component;

class AddToCart extends Component
{
    public Product $product;

    public ?int $variantId = null;

    public ?string $error = null;

    public function select(int $variantId): void
    {
        $variant = $this->product->variants->firstWhere('id', $variantId);

        if ($variant && $variant->inStock()) {
            $this->variantId = $variantId;
            $this->error = null;
        }
    }

    public function add(Cart $cart): void
    {
        $variant = $this->product->variants->firstWhere('id', $this->variantId);

        if (! $variant) {
            $this->error = 'Выберите размер';

            return;
        }

        if (! $cart->add($variant->id)) {
            $this->error = $variant->inStock()
                ? 'В корзине уже весь остаток этого размера'
                : 'Этот размер закончился';

            return;
        }

        $this->error = null;
        $this->dispatch('cart-updated');
        $this->dispatch('open-cart');
    }

    public function render()
    {
        return view('livewire.add-to-cart', [
            'soldOut' => $this->product->isSoldOut(),
        ]);
    }
}
