<?php
namespace App\Services\AI;

/** Public catalog vocabulary only; does not authorize pets, slots, or writes. */
final class VettiBookingCatalog
{
    public static function rows(array $facts): array
    {
        $result=[];
        foreach (($facts['booking_services']??[]) as $row) {
            if (!is_array($row) || !is_string($row['value']??null) || !is_string($row['label']??null)) continue;
            if (preg_match('/[\x00-\x1f\x7f]/u',$row['value'].$row['label'])) continue;
            $value=trim($row['value']);$label=trim($row['label']);
            if ($value==='' || $label==='' || $value==='none' || mb_strlen($value)>120 || mb_strlen($label)>120 || preg_match('/[\x00-\x1f\x7f]/u',$value.$label)) continue;
            $result[$value]=['value'=>$value,'label'=>$label];
            if (count($result)>=100) break;
        }
        return array_values($result);
    }

    public static function choices(array $facts, array $legacyHints): array
    {
        // Older injected fact adapters have no code field. Their hints remain
        // compatible, but BookingConversationService still validates live rows.
        if (!array_key_exists('booking_services',$facts) || !($facts['available']??false)) return $legacyHints;
        return array_values(array_unique(array_merge(['none','grooming'],array_column(self::rows($facts),'value'))));
    }

    /** Exempt exact public service labels from the private-name check only. */
    public static function identityText(string $text, array $facts): string
    {
        $labels=array_column(self::rows($facts),'label');
        usort($labels,static fn($a,$b)=>mb_strlen($b)<=>mb_strlen($a));
        foreach ($labels as $label) $text=preg_replace('/(?<![\p{L}\p{N}])'.preg_quote($label,'/').'(?![\p{L}\p{N}])/iu','service',$text)??$text;
        return $text;
    }
}
