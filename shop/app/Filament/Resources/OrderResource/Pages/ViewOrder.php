<?php

namespace App\Filament\Resources\OrderResource\Pages;

use App\Enums\OrderStatus;
use App\Filament\Resources\OrderResource;
use Filament\Actions;
use Filament\Forms;
use Filament\Notifications\Notification;
use Filament\Resources\Pages\ViewRecord;

class ViewOrder extends ViewRecord
{
    protected static string $resource = OrderResource::class;

    protected function getHeaderActions(): array
    {
        return [
            Actions\Action::make('status')->label('Сменить статус')->icon('heroicon-o-arrow-path')
                ->fillForm(fn () => ['status' => $this->record->status->value])
                ->form([
                    Forms\Components\Select::make('status')->label('Статус')
                        ->options(OrderStatus::options())->required()->selectablePlaceholder(false),
                ])
                ->action(function (array $data) {
                    $this->record->update(['status' => $data['status']]);
                    Notification::make()->title('Статус обновлён')->success()->send();
                }),
        ];
    }
}
