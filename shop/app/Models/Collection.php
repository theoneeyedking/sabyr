<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Collection extends Model
{
    protected $fillable = ['name', 'slug', 'tagline', 'description', 'hero_image', 'is_current', 'released_at'];

    protected function casts(): array
    {
        return ['is_current' => 'boolean', 'released_at' => 'date'];
    }

    protected static function booted(): void
    {
        // Текущим может быть только один дроп.
        static::saved(function (self $collection) {
            if ($collection->is_current) {
                static::whereKeyNot($collection->id)->where('is_current', true)->update(['is_current' => false]);
            }
        });
    }

    public function products(): HasMany
    {
        return $this->hasMany(Product::class);
    }

    public function heroUrl(): ?string
    {
        return $this->hero_image ? '/storage/'.$this->hero_image : null;
    }

    /** Текущий дроп: отмеченный флагом, иначе самый свежий. */
    public static function current(): ?self
    {
        return static::query()->orderByDesc('is_current')->orderByDesc('released_at')->first();
    }
}
