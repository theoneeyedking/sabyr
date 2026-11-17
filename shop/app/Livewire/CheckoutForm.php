<?php

namespace App\Livewire;

use App\Enums\DeliveryMethod;
use App\Enums\OrderStatus;
use App\Models\Order;
use App\Services\Cart;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Livewire\Component;

class CheckoutForm extends Component
{
    public string $name = '';

    public string $phone = '';

    public string $city = 'Алматы';

    public string $address = '';

    public string $delivery = 'courier';

    protected function rules(): array
    {
        return [
            'name' => ['required', 'string', 'min:2', 'max:100'],
            'phone' => ['required', 'string', 'regex:/^\+?[0-9\s\-()]{10,20}$/'],
            'city' => ['required', 'string', 'max:100'],
            'address' => ['required', 'string', 'min:5', 'max:255'],
            'delivery' => ['required', Rule::enum(DeliveryMethod::class)],
        ];
    }

    protected function messages(): array
    {
        return [
            'name.required' => 'Укажите имя',
            'name.min' => 'Слишком короткое имя',
            'phone.required' => 'Укажите телефон',
            'phone.regex' => 'Телефон в формате +7 700 000 00 00',
            'city.required' => 'Укажите город',
            'address.required' => 'Укажите адрес',
            'address.min' => 'Укажите адрес подробнее',
            '*.max' => 'Слишком длинное значение',
            'delivery.*' => 'Выберите способ доставки',
        ];
    }

    /** После первой ошибки поле перепроверяется при уходе с него, чтобы сообщение не висело. */
    public function updated(string $property): void
    {
        if ($this->getErrorBag()->has($property)) {
            $this->validateOnly($property);
        }
    }

    public function pay(Cart $cart)
    {
        $this->validate();

        $lines = $cart->lines();

        if ($lines->isEmpty()) {
            $this->addError('cart', 'Корзина пуста — товары могли закончиться.');

            return null;
        }

        // Оплата — заглушка: заказ просто создаётся со статусом «Ожидает оплаты».
        $order = DB::transaction(function () use ($lines, $cart) {
            $order = Order::create([
                'number' => Order::generateNumber(),
                'status' => OrderStatus::PendingPayment,
                'customer_name' => trim($this->name),
                'phone' => trim($this->phone),
                'city' => trim($this->city),
                'address' => trim($this->address),
                'delivery_method' => $this->delivery,
                'total' => $cart->total(),
            ]);

            foreach ($lines as $line) {
                $order->items()->create([
                    'product_id' => $line->variant->product_id,
                    'product_variant_id' => $line->variant->id,
                    'product_name' => $line->variant->product->name,
                    'size' => $line->variant->size,
                    'price' => $line->variant->product->price,
                    'quantity' => $line->quantity,
                ]);
            }

            return $order;
        });

        $cart->clear();

        return $this->redirectRoute('checkout.thanks', $order);
    }

    public function render(Cart $cart)
    {
        return view('livewire.checkout-form', [
            'lines' => $cart->lines(),
            'total' => $cart->total(),
            'methods' => DeliveryMethod::cases(),
        ]);
    }
}
