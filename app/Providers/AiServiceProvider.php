<?php

namespace App\Providers;

use App\Services\AI\AiProviderInterface;
use App\Services\AI\Providers\FakeAiProvider;
use App\Services\AI\Providers\GeminiProvider;
use Illuminate\Support\ServiceProvider;
use InvalidArgumentException;

class AiServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        $this->app->bind(AiProviderInterface::class, static function (): AiProviderInterface {
            return match (config('ai.provider', 'gemini')) {
                'gemini' => new GeminiProvider(),
                'fake' => new FakeAiProvider(),
                default => throw new InvalidArgumentException('Unsupported AI provider configuration.'),
            };
        });
    }
}
