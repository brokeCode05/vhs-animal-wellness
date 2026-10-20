<?php

namespace App\Http\Controllers;

use App\Models\Service;
use App\Support\ApiResponse;
use App\Support\AuditWriter;
use App\Support\VhsPresenter;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class ServicesController extends Controller
{
    use ApiResponse;

    public function index(Request $r)
    {
        $q=Service::query()->orderBy('id');
        if ($r->has('active')) $q->where('active',filter_var($r->input('active'),FILTER_VALIDATE_BOOLEAN));
        return $this->ok('Services loaded.',['services'=>$q->get()->map(fn($s)=>VhsPresenter::service($s))->values()]);
    }
    public function store(Request $r)
    {
        $v=$r->validate(['value'=>['nullable','string','max:100','unique:services,value'],'label'=>['required','string','max:120'],'category'=>['required_without:group','nullable','string','max:60'],'group'=>['required_without:category','nullable','string','max:60'],'price'=>['required','numeric','min:0','max:99999999.99'],'active'=>['sometimes','boolean']]);
        $value=$v['value']??strtolower(preg_replace('/[^a-z0-9]+/i','_',trim($v['label']))); $value=trim($value,'_');
        abort_if(Service::withTrashed()->where('value',$value)->exists(),409,'Service key already exists.');
        $s=new Service; $s->forceFill(['value'=>$value,'label'=>trim($v['label']),'category'=>trim($v['category']??$v['group']),'price'=>$v['price'],'currency'=>'PHP','active'=>$v['active']??true])->save();
        AuditWriter::write($r->user(),'service_created','service',$s->id,$r->user()->name.' created service '.$s->label.'.');
        return $this->ok('Service created.',['service'=>VhsPresenter::service($s)],201);
    }
    public function update(Request $r, Service $service)
    {
        $v=$r->validate(['label'=>['sometimes','string','max:120'],'category'=>['sometimes','string','max:60'],'group'=>['sometimes','string','max:60'],'price'=>['sometimes','numeric','min:0','max:99999999.99']]);
        if(array_key_exists('label',$v))$service->label=trim($v['label']); if(array_key_exists('category',$v)||array_key_exists('group',$v))$service->category=trim($v['category']??$v['group']); if(array_key_exists('price',$v))$service->price=$v['price']; $service->save();
        AuditWriter::write($r->user(),'service_updated','service',$service->id,$r->user()->name.' updated service '.$service->label.'.');
        return $this->ok('Service updated.',['service'=>VhsPresenter::service($service)]);
    }
    public function status(Request $r, Service $service)
    {
        $v=$r->validate(['active'=>['required','boolean']]); $old=(bool)$service->active; $service->active=(bool)$v['active']; $service->save();
        AuditWriter::write($r->user(),$service->active?'service_activated':'service_deactivated','service',$service->id,$r->user()->name.' changed service availability.',null,['previous'=>$old,'new'=>(bool)$service->active]);
        return $this->ok('Service status updated.',['service'=>VhsPresenter::service($service)]);
    }
    public function destroy(Request $r, Service $service)
    {
        abort_if($service->appointments()->exists(),409,'Service is already used by an appointment and cannot be deleted.');
        $id=$service->id;$label=$service->label;$service->delete(); AuditWriter::write($r->user(),'service_deleted','service',$id,$r->user()->name.' deleted service '.$label.'.');
        return $this->ok('Service deleted.');
    }
}
