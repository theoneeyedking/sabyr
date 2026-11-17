<?php

namespace App\Filament\Resources;

use App\Enums\DeliveryMethod;
use App\Enums\OrderStatus;
use App\Filament\Resources\OrderResource\Pages;
use App\Models\Order;
use App\Models\OrderItem;
use App\Support\Money;
use Filament\Infolists;
use Filament\Infolists\Infolist;
use Filament\Resources\Resource;
use Filament\Tables;
use Filament\Tables\Table;

class OrderResource extends Resource
{
    protected static ?string $model = Order::class;

    protected static ?string $navigationIcon = 'heroicon-o-clipboard-document-list';

    protected static ?string $navigationGroup = 'Продажи';

    protected static ?string $modelLabel = 'заказ';

    protected static ?string $pluralModelLabel = 'Заказы';

    protected static ?string $recordTitleAttribute = 'number';

    public static function canCreate(): bool
    {
        return false;
    }

    public static function getNavigationBadge(): ?string
    {
        return (string) Order::where('status', OrderStatus::PendingPayment)->count() ?: null;
    }

    public static function getNavigationBadgeTooltip(): ?string
    {
        return 'Ожидают оплаты';
    }

    public static function table(Table $table): Table
    {
        return $table
            ->defaultSort('created_at', 'desc')
            ->columns([
                Tables\Columns\TextColumn::make('number')->label('Номер')->searchable()->weight('bold'),
                Tables\Columns\TextColumn::make('created_at')->label('Дата')->dateTime('d.m.Y H:i')->sortable(),
                Tables\Columns\TextColumn::make('customer_name')->label('Покупатель')->searchable()
                    ->description(fn (Order $record) => $record->phone),
                Tables\Columns\TextColumn::make('city')->label('Город')->toggleable(),
                Tables\Columns\TextColumn::make('delivery_method')->label('Доставка')
                    ->formatStateUsing(fn (DeliveryMethod $state) => $state->label())->toggleable(),
                Tables\Columns\TextColumn::make('total')->label('Сумма')->sortable()
                    ->formatStateUsing(fn ($state) => Money::format($state)),
                Tables\Columns\SelectColumn::make('status')->label('Статус')
                    ->options(OrderStatus::options())->selectablePlaceholder(false),
            ])
            ->filters([
                Tables\Filters\SelectFilter::make('status')->label('Статус')->options(OrderStatus::options()),
            ])
            ->actions([Tables\Actions\ViewAction::make()]);
    }

    public static function infolist(Infolist $infolist): Infolist
    {
        return $infolist->schema([
            Infolists\Components\Section::make('Заказ')->schema([
                Infolists\Components\TextEntry::make('number')->label('Номер')->weight('bold'),
                Infolists\Components\TextEntry::make('created_at')->label('Создан')->dateTime('d.m.Y H:i'),
                Infolists\Components\TextEntry::make('status')->label('Статус')->badge()
                    ->formatStateUsing(fn (OrderStatus $state) => $state->label())
                    ->color(fn (OrderStatus $state) => $state->color()),
                Infolists\Components\TextEntry::make('total')->label('Сумма')
                    ->formatStateUsing(fn ($state) => Money::format($state))->weight('bold'),
            ])->columns(4),

            Infolists\Components\Section::make('Покупатель и доставка')->schema([
                Infolists\Components\TextEntry::make('customer_name')->label('Имя'),
                Infolists\Components\TextEntry::make('phone')->label('Телефон')->copyable(),
                Infolists\Components\TextEntry::make('delivery_method')->label('Способ доставки')
                    ->formatStateUsing(fn (DeliveryMethod $state) => $state->label()),
                Infolists\Components\TextEntry::make('city')->label('Город'),
                Infolists\Components\TextEntry::make('address')->label('Адрес')->columnSpan(2),
            ])->columns(3),

            Infolists\Components\Section::make('Состав заказа')->schema([
                Infolists\Components\RepeatableEntry::make('items')->hiddenLabel()->schema([
                    Infolists\Components\TextEntry::make('product_name')->label('Товар'),
                    Infolists\Components\TextEntry::make('size')->label('Размер'),
                    Infolists\Components\TextEntry::make('quantity')->label('Кол-во')->suffix(' шт.'),
                    Infolists\Components\TextEntry::make('price')->label('Сумма')
                        ->getStateUsing(fn (OrderItem $record) => Money::format($record->subtotal())),
                ])->columns(4),
            ]),
        ]);
    }

    public static function getPages(): array
    {
        return [
            'index' => Pages\ListOrders::route('/'),
            'view' => Pages\ViewOrder::route('/{record}'),
        ];
    }
}
