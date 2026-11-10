<?php
namespace Tests\Feature\AI;
use App\Services\AI\BookingScheduleConstraint as Schedule;
use Tests\TestCase;
final class BookingScheduleConstraintTest extends TestCase {
 public function test_interval_boundaries_unknown_duration_and_no_matching_slots():void {
  $s=['blocked'=>[[720,1080]],'allowed'=>[[0,720],[1080,1440]]];
  self::assertTrue(Schedule::permits('11:00',60,$s));self::assertFalse(Schedule::permits('11:30',60,$s));
  self::assertFalse(Schedule::permits('12:00',30,$s));self::assertTrue(Schedule::permits('18:00',60,$s));
  self::assertTrue(Schedule::permits('11:30',null,$s));self::assertFalse(Schedule::permits('17:59',null,$s));
  self::assertFalse(Schedule::permits('08:00',60,['blocked'=>[[0,1440]]]));
 }
 public function test_source_grounding_english_filipino_and_explicit_intervals():void {
  foreach (['Busy ako sa hapon','I have commitments in the afternoon'] as $q) {
   $r=Schedule::merge([],['mode'=>'replace','source_quote'=>$q,'blocked'=>[['daypart'=>'afternoon','start'=>'','end'=>'']]],$q);
   self::assertSame([[720,1080]],$r['schedule']['blocked']);
  }
  $q='I am busy from 9 AM until 11:30 AM';$r=Schedule::merge([],['mode'=>'replace','source_quote'=>$q,'blocked'=>[['daypart'=>'none','start'=>'9 AM','end'=>'11:30 AM']]],$q);
  self::assertSame([[540,690]],$r['schedule']['blocked']);
  $r=Schedule::merge([],['mode'=>'replace','source_quote'=>$q,'blocked'=>[['daypart'=>'none','start'=>'9 AM','end'=>'3 PM']]],$q);self::assertArrayHasKey('error',$r);
  $r=Schedule::merge([],['mode'=>'unclear','source_quote'=>'busy'], 'I am busy');self::assertTrue($r['schedule']['unclear']);self::assertFalse(Schedule::permits('10:00',30,$r['schedule']));
 }
 public function test_repeated_saved_ranges_are_no_op_but_new_ungrounded_ranges_are_rejected():void {
  $old=['blocked'=>[[720,1080]],'allowed'=>[[0,720]],'unclear'=>false];
  $echo=['mode'=>'replace','source_quote'=>'bukas','blocked'=>[['daypart'=>'afternoon','start'=>'','end'=>'']],'allowed'=>[['daypart'=>'morning','start'=>'','end'=>'']]];
  self::assertSame($old,Schedule::merge($old,$echo,'bukas ngani')['schedule']);
  $echo['allowed'][0]['daypart']='evening';self::assertArrayHasKey('error',Schedule::merge($old,$echo,'bukas ngani'));
  $echo=['mode'=>'replace','source_quote'=>'tomorrow','blocked'=>[['daypart'=>'none','start'=>'12:00','end'=>'18:00']]];
  self::assertSame($old,Schedule::merge($old,$echo,'tomorrow')['schedule']);
 }
}
