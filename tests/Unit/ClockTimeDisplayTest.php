<?php
namespace Tests\Unit;

use App\Services\AI\ClockTimeDisplay;
use PHPUnit\Framework\TestCase;

final class ClockTimeDisplayTest extends TestCase
{
    public function test_midnight_noon_and_other_times_are_displayed_in_twelve_hour_format(): void
    {
        self::assertSame('12:00 AM',ClockTimeDisplay::from24('00:00'));
        self::assertSame('9:30 AM',ClockTimeDisplay::from24('09:30'));
        self::assertSame('12:00 PM',ClockTimeDisplay::from24('12:00'));
        self::assertSame('1:00 PM',ClockTimeDisplay::from24('13:00'));
        self::assertSame('11:59 PM',ClockTimeDisplay::from24('23:59'));
        self::assertSame('24:00',ClockTimeDisplay::from24('24:00'));
    }
}
