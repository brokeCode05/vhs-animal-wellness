<?php
namespace Tests\Feature\AI;

use App\Services\AI\VerifiedVettiNumbers;
use Tests\TestCase;

final class VerifiedVettiNumbersTest extends TestCase
{
    public function test_partial_numbers_are_not_treated_as_verified_prices(): void
    {
        $facts = ['price_min'=>'500.00','currency'=>'PHP'];
        self::assertTrue(VerifiedVettiNumbers::allPresent('Starts at PHP 500.', $facts));
        self::assertTrue(VerifiedVettiNumbers::allPresent('Starts at PHP 500.00.', $facts));
        self::assertFalse(VerifiedVettiNumbers::allPresent('Starts at PHP 50.', $facts));
        self::assertFalse(VerifiedVettiNumbers::allPresent('Starts at PHP 5.', $facts));
        self::assertFalse(VerifiedVettiNumbers::allPresent('Starts at PHP 5000.', $facts));
        self::assertFalse(VerifiedVettiNumbers::allPresent('Starts at PHP 500.', ['price_min'=>null]));
    }

    public function test_grouped_prices_match_only_their_complete_verified_amount(): void
    {
        $facts = ['price_min'=>'650.00', 'price_max'=>'6000.00'];
        self::assertTrue(VerifiedVettiNumbers::allPresent('₱650.00 to ₱6,000.00', $facts));
        self::assertTrue(VerifiedVettiNumbers::allPresent('PHP 6,000', $facts));
        self::assertFalse(VerifiedVettiNumbers::allPresent('PHP 600', $facts));
        self::assertFalse(VerifiedVettiNumbers::allPresent('PHP 60,00', $facts));
        self::assertFalse(VerifiedVettiNumbers::allPresent('PHP 60,000', $facts));
        self::assertFalse(VerifiedVettiNumbers::allPresent('PHP 1,200', ['price_min'=>'100.00']));
    }

    public function test_sequential_list_markers_are_not_mistaken_for_clinic_numeric_claims(): void
    {
        self::assertTrue(VerifiedVettiNumbers::allPresent("1. Choose a registered pet.\n2. Review and complete OTP.", []));
        self::assertTrue(VerifiedVettiNumbers::allPresent("1) Choose a service.\n2) Review PHP 500.00.", ['price_min'=>'500.00']));
        self::assertFalse(VerifiedVettiNumbers::allPresent("1. Pay PHP 500.\n2. Confirm.", []));
        self::assertFalse(VerifiedVettiNumbers::allPresent("1. Arrive at 12:00.\n2. Confirm.", []));
        self::assertFalse(VerifiedVettiNumbers::allPresent("1. First.\n3. Skipped.", []));
        self::assertFalse(VerifiedVettiNumbers::allPresent("1.5 kg recorded.\n2.5 kg recorded.", []));
    }
}
