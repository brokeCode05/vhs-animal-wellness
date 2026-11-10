<?php
namespace App\Services\AI;

/** Authoritative role, privacy and list-state replies. Tone never selects data. */
final class VettiReplyPolicy
{
    public static function thirdParty(string $message): bool
    {
        return (bool) preg_match('/\b(?:neighbou?r[\x27\x{2019}]?s|someone else[\x27\x{2019}]?s|(?:another|other|different)\s+(?:pet\s+)?(?:owner|customer|client)|not my (?:pet|dog|cat)|hindi (?:ko|akin)|ibang may[- ]?ari|pet ng iba)\b|\b(?:friend|relative|sister|brother)[\x27\x{2019}]?s\s+(?:pet|dog|cat|records?|documents?|appointments?)\b|\b(?:for|of|about|ng|ni|kay)\s+(?:the\s+)?(?:customer|client|owner)\b/iu',$message);
    }

    public static function unsupportedScript(string $message): bool
    {
        return !preg_match('/\p{Latin}/u',$message) && (bool)preg_match('/\p{L}/u',$message);
    }

    private static function filipino(string $message,string $language): bool
    {
        $chosen=VettiConversationContext::responseLanguage($message,$language);
        return in_array($chosen,['filipino','taglish'],true)
            || ($chosen==='unspecified' && preg_match('/\b(?:ko|mo|po|akin|alaga|paki|ipakita|sino|ano|paano|pwede|puwede)\b/iu',$message));
    }

    public static function reply(string $kind,string $message='',string $language='unspecified',string $subject=''): string
    {
        $fil=self::filipino($message,$language);
        if($kind==='unsupported_language') return 'I currently support English, Filipino, or Taglish. Please ask in one of those languages so I can help.';
        if($kind==='private') return $fil
            ? 'Para sa privacy, sarili mong pets at records lang ang maipapakita ko. Hindi ako puwedeng magbigay o magkumpirma ng impormasyon tungkol sa ibang owner o sa pets nila.'
            : 'For privacy, I can only help with pets and records on your own account. I can’t share or confirm information about another owner or their pets.';
        if($kind==='unsupported') {
            // A short literal excerpt acknowledges the topic without letting
            // the model invent an answer, recipe or instructions in a refusal.
            $subject=trim($subject);
            if($subject==='' || mb_strlen($subject)>60 || mb_stripos($message,$subject)===false || preg_match('/[<>@\x00-\x1f]|\bPET_/u',$subject))$subject='';
            $topic=$subject!==''?'“'.$subject.'”':($fil?'ang topic na iyon':'that topic');
            return $fil?'Hindi ako makakatulong sa '.$topic.' dito. Para ako sa VHS clinic services at pagbisita ng pets.'
                :'I can’t help with '.$topic.' here. I’m here for VHS clinic services and pet visits.';
        }
        if($kind==='unverified')return $fil?'Hindi ko ma-verify ang item na iyon sa clinic. Puwede mong itanong sa clinic kung available ito.':'I can’t verify that item with the clinic. Please contact the clinic to check whether it’s available.';
        return $fil?'Anong gusto mong malaman tungkol sa clinic o sa kaya kong gawin dito?':'What would you like to know about the clinic or what I can help you with here?';
    }

    public static function listText(string $kind,bool $hasResults,bool $petSpecific,string $message,string $language='unspecified',?string $operation=null): string
    {
        $fil=self::filipino($message,$language);
        $label=match($kind){'upcoming_appointments'=>$fil?'susunod na appointments':'upcoming appointments','appointment_history'=>$fil?'tapos nang visits':'completed visits',default=>$fil?'documents':'documents'};
        $for=$petSpecific?($fil?' para sa pet na ito':' for this pet'):($fil?' para sa pets sa account mo':' for pets on your account');
        $text=$hasResults?($fil?'Narito ang '.$label.$for.'.':'Here are the '.$label.$for.'.')
            :($fil?'Walang '.$label.' na nakita'.$for.'.':'No '.$label.' were found'.$for.'.');
        if($operation!==null && $hasResults)$text.=$fil?' Piliin ang appointment na gusto mong i-review. Wala pang nababago.':' Choose the appointment you’d like to review. Nothing has been changed.';
        return $text;
    }

    public static function capabilities(bool $authenticated=false): array
    {
        return ['assistant_name'=>'Vetti','role'=>'AI assistant for VHS Animal Wellness Center',
            'can_help_with'=>$authenticated
                ? ['clinic services and listed prices','clinic hours, location and contact details','your registered pets','editable pet-registration forms','your appointment lists and booking proposals','your authorized document listings and portal navigation']
                : ['clinic services and listed prices','clinic hours, location and contact details','general visit preparation','signup and booking guidance'],
            'limits'=>['VHS clinic and assistant topics only','no diagnosis or personalized treatment advice','no information about other owners or their pets','forms and booking proposals need owner review and confirmation'],
            'access'=>$authenticated?'signed-in owner only':'public information only'];
    }
}
