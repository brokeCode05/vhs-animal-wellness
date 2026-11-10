<?php

namespace App\Services\AI;

use Illuminate\Support\Carbon;

/** Calendar validation shared by proposals and appointment-management hints.
 * Models identify intent; the current message and Manila clock establish dates.
 */
final class BookingDateResolver
{
    public function resolve(string $message, string $expression): array
    {
        $references = $this->references($message);
        if (!$references || in_array([], $references, true)) return ['error'=>'invalid_date_update'];
        $dates = array_shift($references);
        foreach ($references as $reference) $dates = array_values(array_intersect($dates, $reference));
        if (!$dates) return ['error'=>'conflicting_date_update'];
        if (count($dates) !== 1) return ['error'=>'ambiguous_date_update'];

        // Normalization is harmless only if it still denotes the date supplied
        // by the owner. A model cannot select a different day or resolve a conflict.
        $suggestions = $this->references($expression);
        if (!$suggestions || in_array([], $suggestions, true)) return ['error'=>'invalid_date_update'];
        foreach ($suggestions as $suggestion) {
            if (!in_array($dates[0], $suggestion, true)) return ['error'=>'invalid_date_update'];
        }
        $today = Carbon::today(config('app.timezone', 'Asia/Manila'));
        if ($dates[0] < $today->toDateString() || $dates[0] > $today->copy()->addDays(30)->toDateString()) {
            return ['error'=>'invalid_date_update'];
        }
        return ['date'=>$dates[0]];
    }

    /** Each reference can have two candidates when a slash date is ambiguous. */
    private function references(string $text): array
    {
        $today = Carbon::today(config('app.timezone', 'Asia/Manila'));
        $references = [];
        preg_match_all('/(?<![\pL\pN])(?:(?:the\s+)?day after tomorrow|makalawa|tomorrow|bukas|today|ngayon)(?![\pL\pN])/iu', $text, $relative);
        foreach ($relative[0] as $phrase) {
            $days = match (mb_strtolower(trim($phrase))) {
                'today','ngayon'=>0, 'tomorrow','bukas'=>1, default=>2,
            };
            $references[] = [$today->copy()->addDays($days)->toDateString()];
        }
        preg_match_all('/(?<![\pL\pN])\d{4}-\d{2}-\d{2}(?![\pL\pN])/u', $text, $iso);
        foreach ($iso[0] as $phrase) {
            [$year,$month,$day] = array_map('intval', explode('-', $phrase));
            $references[] = checkdate($month,$day,$year) ? [$phrase] : [];
        }
        preg_match_all('/(?<![\pL\pN\/-])(\d{1,2})[\/-](\d{1,2})[\/-](\d{4}|\d{2})(?![\pL\pN\/-])/u', $text, $numeric, PREG_SET_ORDER);
        foreach ($numeric as $match) {
            $dates = [];
            $year = strlen($match[3]) === 2 ? 2000 + (int)$match[3] : (int)$match[3];
            foreach ([[(int)$match[1],(int)$match[2]],[(int)$match[2],(int)$match[1]]] as [$month,$day]) {
                if (checkdate($month,$day,$year)) $dates[] = sprintf('%04d-%02d-%02d',$year,$month,$day);
            }
            $references[] = array_values(array_unique($dates));
        }
        $months = ['jan'=>1,'feb'=>2,'mar'=>3,'apr'=>4,'may'=>5,'jun'=>6,'jul'=>7,'aug'=>8,'sep'=>9,'oct'=>10,'nov'=>11,'dec'=>12];
        $monthPattern = '(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)';
        preg_match_all('/(?<![\pL\pN])('.$monthPattern.')\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(\d{4}))?(?![\pL\pN])/iu', $text, $named, PREG_SET_ORDER);
        preg_match_all('/(?<![\pL\pN])(\d{1,2})(?:st|nd|rd|th)?\s+('.$monthPattern.')\.?(?:,?\s+(\d{4}))?(?![\pL\pN])/iu', $text, $dayFirst, PREG_SET_ORDER);
        foreach ($dayFirst as $match) $named[] = [$match[0],$match[2],$match[1],$match[3] ?? ''];
        foreach ($named as $match) {
            $month = $months[mb_strtolower(substr($match[1],0,3))];
            $day = (int)$match[2];
            $yearSpecified = ($match[3] ?? '') !== '';
            $years = $yearSpecified ? [(int)$match[3]] : [$today->year,$today->year+1];
            $dates = [];
            foreach ($years as $year) {
                if (!checkdate($month,$day,$year)) continue;
                $date = sprintf('%04d-%02d-%02d',$year,$month,$day);
                if ($yearSpecified || ($date >= $today->toDateString() && $date <= $today->copy()->addDays(30)->toDateString())) $dates[] = $date;
            }
            $references[] = $dates;
        }
        return $references;
    }
}
