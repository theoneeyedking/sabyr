<?php

namespace App\Models;

use App\Enums\DeliveryMethod;
use App\Enums\OrderStatus;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Order extends Model
{
    protected $fillable = [
        'number', 'status', 'customer_name', 'phone', 'city', 'address', 'delivery_method', 'comment', 'total',
    ];

    protected function casts(): array
    {
        return ['status' => OrderStatus::class, 'delivery_method' => DeliveryMethod::class, 'total' => 'integer'];
    }

    public function items(): HasMany
    {
        return $this->hasMany(OrderItem::class);
    }

    public function getRouteKeyName(): string
    {
        return 'number';
    }

    public static function generateNumber(): string
    {
        do {
            $number = 'BR-'.strtoupper(substr(str_replace(['0', 'O', '1', 'I'], '', bin2hex(random_bytes(8))), 0, 8));
        } while (strlen($number) < 11 || static::where('number', $number)->exists());

        return $number;
    }
}
