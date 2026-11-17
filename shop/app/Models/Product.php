<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Product extends Model
{
    protected $fillable = [
        'collection_id', 'category_id', 'name', 'slug', 'description', 'composition',
        'price', 'old_price', 'images', 'is_active', 'sort',
    ];

    protected function casts(): array
    {
        return ['images' => 'array', 'is_active' => 'boolean', 'price' => 'integer', 'old_price' => 'integer'];
    }

    public function collection(): BelongsTo
    {
        return $this->belongsTo(Collection::class);
    }

    public function category(): BelongsTo
    {
        return $this->belongsTo(Category::class);
    }

    public function variants(): HasMany
    {
        return $this->hasMany(ProductVariant::class)->orderBy('sort')->orderBy('id');
    }

    public function scopeActive(Builder $query): Builder
    {
        return $query->where('is_active', true);
    }

    /** Sold out — когда у всех размеров нулевой остаток (или размеров нет вовсе). */
    public function isSoldOut(): bool
    {
        return $this->variants->sum('stock') <= 0;
    }

    public function hasDiscount(): bool
    {
        return $this->old_price !== null && $this->old_price > $this->price;
    }

    public function discountPercent(): int
    {
        return $this->hasDiscount() ? (int) round(100 - $this->price / $this->old_price * 100) : 0;
    }

    /** @return list<string> */
    public function imageUrls(): array
    {
        return array_values(array_map(fn (string $path) => '/storage/'.$path, $this->images ?? []));
    }

    public function coverUrl(): ?string
    {
        return $this->imageUrls()[0] ?? null;
    }

    public function hoverUrl(): ?string
    {
        return $this->imageUrls()[1] ?? null;
    }
}
