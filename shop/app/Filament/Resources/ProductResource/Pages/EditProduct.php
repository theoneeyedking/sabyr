<?php

namespace App\Filament\Resources\ProductResource\Pages;

use App\Filament\Resources\ProductResource;
use Filament\Actions;
use Filament\Resources\Pages\EditRecord;

class EditProduct extends EditRecord
{
    protected static string $resource = ProductResource::class;

    protected function getHeaderActions(): array
    {
        return [
            Actions\Action::make('view')->label('Открыть на сайте')->color('gray')
                ->url(fn () => route('product', $this->record))->openUrlInNewTab(),
            Actions\DeleteAction::make(),
        ];
    }
}
