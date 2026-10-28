<?php

namespace App\Services\AI;

use RuntimeException;

final class AiProviderException extends RuntimeException
{
    public function __construct(public readonly string $category, public readonly ?int $httpStatus = null)
    {
        parent::__construct('AI provider request failed.');
    }
}
