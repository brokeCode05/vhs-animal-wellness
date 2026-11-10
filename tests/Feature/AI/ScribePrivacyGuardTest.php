<?php
namespace Tests\Feature\AI;

use App\Services\ScribePrivacyGuard;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

final class ScribePrivacyGuardTest extends TestCase
{
    public static function examples(): array
    {
        return [
            'email'=>['Contact owner at test@example.com for follow-up.',true],
            'email uppercase'=>['Please email OWNER+test@EXAMPLE.ORG.',true],
            'mobile compact'=>['Call 09171234567 for update.',true],
            'mobile spaced'=>['Call 0917 123 4567 for update.',true],
            'mobile international'=>['Call +63 917-123-4567 for update.',true],
            'vital readings'=>['Weight is 7 kg. Temperature is 39 C. Heart rate is 100 bpm.',false],
            'fictional anonymous'=>['Owner reports the dog is coughing for three days.',false],
            'not a complete phone'=>['Weight 9.17 kg and follow up on day 12.',false],
        ];
    }
    #[DataProvider('examples')]
    public function test_contact_detection(string $text,bool $expected): void
    {
        self::assertSame($expected,(new ScribePrivacyGuard)->hasContactDetails($text));
    }
}
