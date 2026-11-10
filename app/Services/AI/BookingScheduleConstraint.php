<?php
namespace App\Services\AI;

/** Model describes meaning; Laravel verifies source expressions and owns intervals. */
final class BookingScheduleConstraint
{
    public static function schema(): array
    {
        $interval=['type'=>'object','properties'=>[
            'daypart'=>['type'=>'string','enum'=>['none','morning','afternoon','evening','whole_day']],
            'start'=>['type'=>'string'],'end'=>['type'=>'string'],
        ],'required'=>['daypart','start','end'],'additionalProperties'=>false];
        return ['type'=>'object','properties'=>[
            'mode'=>['type'=>'string','enum'=>['keep','replace','clear','unclear']],
            'source_quote'=>['type'=>'string'],
            'blocked'=>['type'=>'array','items'=>$interval],
            'allowed'=>['type'=>'array','items'=>$interval],
        ],'required'=>['mode','source_quote'],'additionalProperties'=>false];
    }

    public static function merge(array $previous, ?array $update, string $message): array
    {
        $mode=$update['mode'] ?? 'keep';
        if ($mode==='keep') return ['schedule'=>$previous];
        // Reasserting already verified ranges is context, not a new change.
        // A date-only reply may echo them without repeating their source words.
        if ($mode==='replace' && self::repeats($previous,$update)) return ['schedule'=>$previous];
        $quote=trim((string)($update['source_quote'] ?? ''));
        if ($quote==='' || mb_stripos($message,$quote)===false) return ['error'=>'invalid_availability_update'];
        if ($mode==='clear') return ['schedule'=>[]];
        if ($mode==='unclear') return ['schedule'=>array_merge($previous,['unclear'=>true])];
        if ($mode!=='replace') return ['error'=>'invalid_availability_update'];
        $next=$previous; $changed=false;
        foreach (['blocked','allowed'] as $kind) {
            if (!array_key_exists($kind,$update)) continue;
            if (!is_array($update[$kind]) || count($update[$kind])>8) return ['error'=>'invalid_availability_update'];
            $ranges=[];
            foreach ($update[$kind] as $interval) {
                if (!is_array($interval)) return ['error'=>'invalid_availability_update'];
                $part=$interval['daypart'] ?? 'none';
                if ($part!=='none') {
                    $patterns=['morning'=>'/\b(?:morning|umaga)\b/iu','afternoon'=>'/\b(?:afternoon|hapon)\b/iu',
                        'evening'=>'/\b(?:evening|night|gabi)\b/iu','whole_day'=>'/\b(?:all[ -]?day|whole[ -]?day|buong\s+araw|maghapon)\b/iu'];
                    if (!isset($patterns[$part]) || !preg_match($patterns[$part],$quote)) return ['error'=>'invalid_availability_update'];
                    [$from,$to]=match($part){'morning'=>[0,720],'afternoon'=>[720,1080],'evening'=>[1080,1440],'whole_day'=>[0,1440]};
                } else {
                    $from=self::clock((string)($interval['start'] ?? ''),$quote);
                    $to=self::clock((string)($interval['end'] ?? ''),$quote);
                    if ($from===null || $to===null || $from>=$to) return ['error'=>'invalid_availability_update'];
                }
                $ranges[]=[$from,$to];
            }
            $next[$kind]=$ranges; $changed=true;
        }
        if (!$changed) return ['error'=>'invalid_availability_update'];
        $next['unclear']=false;
        return ['schedule'=>$next];
    }

    private static function repeats(array $previous,array $update): bool
    {
        $provided=false;
        foreach (['blocked','allowed'] as $kind) {
            if (!array_key_exists($kind,$update)) continue;
            $provided=true;
            if (!is_array($update[$kind]) || count($update[$kind])>8) return false;
            $ranges=[];
            foreach ($update[$kind] as $interval) {
                if (!is_array($interval)) return false;
                $range=match($interval['daypart'] ?? 'none') {
                    'morning'=>[0,720], 'afternoon'=>[720,1080],
                    'evening'=>[1080,1440], 'whole_day'=>[0,1440], default=>null,
                };
                if ($range===null) {
                    $start=(string)($interval['start'] ?? '');$end=(string)($interval['end'] ?? '');
                    $from=self::clock($start,$start);$to=self::clock($end,$end);
                    if ($from===null || $to===null || $from>=$to) return false;
                    $range=[$from,$to];
                }
                $ranges[]=$range;
            }
            $saved=$previous[$kind] ?? [];sort($ranges);sort($saved);
            if ($ranges!==$saved) return false;
        }
        return $provided;
    }

    private static function clock(string $expression,string $source): ?int
    {
        $expression=trim($expression);
        if ($expression==='' || mb_stripos($source,$expression)===false) return null;
        if (preg_match('/\A(1[0-2]|0?[1-9])(?::([0-5]\d))?\s*([ap])\.?m\.?\z/iu',$expression,$m))
            return ((int)$m[1]%12+(mb_strtolower($m[3])==='p'?12:0))*60+(int)($m[2]??0);
        if (preg_match('/\A([01]?\d|2[0-3]):([0-5]\d)\z/',$expression,$m)) return (int)$m[1]*60+(int)$m[2];
        return null;
    }

    /** Unknown duration permits verified starts, never a claim of complete fit. */
    public static function permits(string $slot, ?int $minutes, array $schedule): bool
    {
        if ($schedule['unclear'] ?? false) return false;
        [$h,$m]=array_map('intval',explode(':',$slot)); $start=$h*60+$m;
        $end=$start+max(1,$minutes ?? 1);
        foreach ($schedule['blocked'] ?? [] as [$from,$to]) if ($start<$to && $end>$from) return false;
        $allowed=$schedule['allowed'] ?? [];
        if (!$allowed) return true;
        foreach ($allowed as [$from,$to]) if ($start>=$from && $end<=$to) return true;
        return false;
    }
}
