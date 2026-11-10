<?php
namespace Tests\Feature;
use App\Services\AI\BookingDateResolver;
use Illuminate\Support\Carbon;
use Tests\TestCase;
final class BookingDateResolverTest extends TestCase {
 protected function tearDown():void {Carbon::setTestNow();parent::tearDown();}
 public function test_calendar_boundaries_and_numeric_ambiguity_are_explicit():void {
  Carbon::setTestNow(Carbon::parse('2026-12-31 23:50:00','Asia/Manila'));$r=new BookingDateResolver;
  self::assertSame(['date'=>'2027-01-01'],$r->resolve('tomorrow','2027-01-01'));
  self::assertSame(['date'=>'2027-01-01'],$r->resolve('Jan 1','January 1, 2027'));
  self::assertSame(['date'=>'2027-01-30'],$r->resolve('January 30, 2027','2027-01-30'));
  self::assertArrayHasKey('error',$r->resolve('January 31, 2027','2027-01-31'));
  self::assertSame(['date'=>'2027-01-01'],$r->resolve('bukas (01/01/2027)','tomorrow'));
  self::assertSame(['date'=>'2027-01-15'],$r->resolve('15/01/2027','2027-01-15'));
  self::assertSame(['date'=>'2027-01-15'],$r->resolve('01/15/2027','2027-01-15'));
  self::assertArrayHasKey('error',$r->resolve('2027-02-30','2027-02-30'));
  self::assertArrayHasKey('error',$r->resolve('next week','2027-01-07'));
  self::assertArrayHasKey('error',$r->resolve('tomorrowish','tomorrow'));
  self::assertArrayHasKey('error',$r->resolve('the day after tomorrowish','day after tomorrow'));
 }
 public function test_short_year_numeric_dates_and_ambiguity():void {
  Carbon::setTestNow(Carbon::parse('2026-11-11 10:00:00','Asia/Manila'));$r=new BookingDateResolver;
  self::assertSame(['date'=>'2026-11-20'],$r->resolve('11-20-26','2026-11-20'));
  self::assertSame(['date'=>'2026-11-20'],$r->resolve('20/11/26','20/11/26'));
  self::assertSame(['date'=>'2026-11-20'],$r->resolve('November 20','November 20'));
  self::assertSame(['error'=>'ambiguous_date_update'],$r->resolve('11/12/26','2026-11-12'));
  self::assertArrayHasKey('error',$r->resolve('02/30/26','02/30/26'));
  self::assertArrayHasKey('error',$r->resolve('11-20-27','11-20-27'));
 }
}

