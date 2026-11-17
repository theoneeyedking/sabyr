<?php

namespace App\Livewire;

use App\Models\Category;
use App\Models\Product;
use Livewire\Attributes\Url;
use Livewire\Component;

class CatalogGrid extends Component
{
    #[Url(as: 'category', except: '')]
    public string $category = '';

    public function setCategory(string $slug): void
    {
        $this->category = $slug;
    }

    public function render()
    {
        $categories = Category::orderBy('sort')->get();

        if ($this->category !== '' && ! $categories->contains('slug', $this->category)) {
            $this->category = '';
        }

        $products = Product::active()
            ->with(['variants', 'category'])
            ->when($this->category !== '', fn ($q) => $q->whereRelation('category', 'slug', $this->category))
            ->orderBy('sort')
            ->get();

        return view('livewire.catalog-grid', compact('categories', 'products'));
    }
}
