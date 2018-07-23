<?php
if(!defined('OSTCLIENTINC') || !is_object($thisclient) || !$thisclient->isValid()) die('Access Denied');

$settings = &$_SESSION['client:Q'];

// Unpack search, filter, and sort requests
if (isset($_REQUEST['clear']))
    $settings = array();
if (isset($_REQUEST['keywords'])) {
    $settings['keywords'] = $_REQUEST['keywords'];
}
if (isset($_REQUEST['topic_id'])) {
    $settings['topic_id'] = $_REQUEST['topic_id'];
}
if (isset($_REQUEST['status'])) {
    $settings['status'] = $_REQUEST['status'];
}

$org_tickets = $thisclient->canSeeOrgTickets();
if ($settings['keywords']) {
    // Don't show stat counts for searches
    $openTickets = $closedTickets = -1;
}
elseif ($settings['topic_id']) {
    $openTickets = $thisclient->getNumTopicTicketsInState($settings['topic_id'],
        'open', $org_tickets);
    $closedTickets = $thisclient->getNumTopicTicketsInState($settings['topic_id'],
        'closed', $org_tickets);
}
else {
    $openTickets = $thisclient->getNumOpenTickets($org_tickets);
    $closedTickets = $thisclient->getNumClosedTickets($org_tickets);
}

$tickets = Ticket::objects();

$qs = array();
$status=null;

$sortOptions=array('id'=>'number', 'subject'=>'cdata__subject',
                    'status'=>'status__name', 'dept'=>'dept__name','date'=>'created');
$orderWays=array('DESC'=>'-','ASC'=>'');
//Sorting options...
$order_by=$order=null;
$sort=($_REQUEST['sort'] && $sortOptions[strtolower($_REQUEST['sort'])])?strtolower($_REQUEST['sort']):'date';
if($sort && $sortOptions[$sort])
    $order_by =$sortOptions[$sort];

$order_by=$order_by ?: $sortOptions['date'];
if ($_REQUEST['order'] && $orderWays[strtoupper($_REQUEST['order'])])
    $order = $orderWays[strtoupper($_REQUEST['order'])];
else
    $order = $orderWays['DESC'];

$x=$sort.'_sort';
$$x=' class="'.strtolower($_REQUEST['order'] ?: 'desc').'" ';

$basic_filter = Ticket::objects();
if ($settings['topic_id']) {
    $basic_filter = $basic_filter->filter(array('topic_id' => $settings['topic_id']));
}

if ($settings['status'])
    $status = strtolower($settings['status']);
    switch ($status) {
    default:
        $status = 'open';
    case 'open':
    case 'closed':
		$results_type = ($status == 'closed') ? __('Closed Tickets') : __('Open Tickets');
        $basic_filter->filter(array('status__state' => $status));
        break;
}

// Add visibility constraints — use a union query to use multiple indexes,
// use UNION without "ALL" (false as second parameter to union()) to imply
// unique values
$visibility = $basic_filter->copy()
    ->values_flat('ticket_id')
    ->filter(array('user_id' => $thisclient->getId()))
    ->union($basic_filter->copy()
        ->values_flat('ticket_id')
        ->filter(array('thread__collaborators__user_id' => $thisclient->getId()))
    , false);

if ($thisclient->canSeeOrgTickets()) {
    $visibility = $visibility->union(
        $basic_filter->copy()->values_flat('ticket_id')
            ->filter(array('user__org_id' => $thisclient->getOrgId()))
    , false);
}

// Perform basic search
if ($settings['keywords']) {
    $q = trim($settings['keywords']);
    if (is_numeric($q)) {
        $tickets->filter(array('number__startswith'=>$q));
    } elseif (strlen($q) > 2) { //Deep search!
        // Use the search engine to perform the search
        $tickets = $ost->searcher->find($q, $tickets);
    }
}

$tickets->distinct('ticket_id');

TicketForm::ensureDynamicDataView();

$total=$visibility->count();
$page=($_GET['p'] && is_numeric($_GET['p']))?$_GET['p']:1;
$pageNav=new Pagenate($total, $page, PAGE_LIMIT);
$qstr = '&amp;'. Http::build_query($qs);
$qs += array('sort' => $_REQUEST['sort'], 'order' => $_REQUEST['order']);
$pageNav->setURL('tickets.php', $qs);
$tickets->filter(array('ticket_id__in' => $visibility));
$pageNav->paginate($tickets);

$showing =$total ? $pageNav->showing() : "";
if(!$results_type)
{
	$results_type=ucfirst($status).' '.__('Tickets');
}
$showing.=($status)?(' '.$results_type):' '.__('All Tickets');
if($search)
    $showing=__('Search Results').": $showing";

$negorder=$order=='-'?'ASC':'DESC'; //Negate the sorting

$tickets->order_by($order.$order_by);
$tickets->values(
    'ticket_id', 'number', 'created', 'isanswered', 'source', 'status_id',
    'status__state', 'status__name', 'cdata__subject', 'dept_id',
    'dept__name', 'dept__ispublic', 'user__default_email__address'
); ?>

<div class="search well">
    <form action="tickets.php" method="get" id="ticketSearchForm">
        <input type="hidden" name="a"  value="search">

        <div class="col-md-12 text-center col">
            <div class="form-group">
                <input type="text" name="keywords" size="30" value="<?php echo Format::htmlchars($settings['keywords']); ?>">
            </div>
            <div class="form-group">
                <?php echo __('Help Topic'); ?>:
                <select name="topic_id" class="nowarn" onchange="javascript: this.form.submit(); ">
                    <option value="">&mdash; <?php echo __('All Help Topics');?> &mdash;</option>
                    <?php
                    foreach (Topic::getHelpTopics(true) as $id=>$name) {
                            $count = $thisclient->getNumTopicTickets($id, $org_tickets);
                            if ($count == 0)
                                continue; ?>
                        <option value="<?php echo $id; ?>"i
                            <?php if ($settings['topic_id'] == $id) echo 'selected="selected"'; ?>
                            ><?php echo sprintf('%s (%d)', Format::htmlchars($name),
                                $thisclient->getNumTopicTickets($id)); ?></option>
                    <?php
                    } ?>
                </select>
            </div>
            <input class="btn btn-primary" type="submit" value="<?php echo __('Search');?>">
        </div>

        <div class="col-md-12 text-center col">
            <?php if ($settings['keywords'] || $settings['topic_id'] || $_REQUEST['sort']) { ?>
                <a class="btn btn-danger" href="?clear">
                    <i class="icon-remove-circle"></i>
                    <?php echo __('Clear all filters and sort'); ?>
                </a>
            <?php } ?>
        </div>

    </form>
</div>

<div style="margin:10px 0">
    <a class="btn btn-primary" href="<?php echo Format::htmlchars($_SERVER['REQUEST_URI']); ?>">
        <i class="refresh icon-refresh"></i>
        <?php echo __('Tickets'); ?>
    </a>

    <div class="pull-right states">
        <small>
            <?php
            if ($openTickets) { ?>
                <a class="btn btn-info <?php if ($status == 'open') echo 'active'; ?>"
                    href="?<?php echo Http::build_query(array('a' => 'search', 'status' => 'open')); ?>">
                    <i class="icon-file-alt"></i>
                    <?php echo _P('ticket-status', 'Open'); if ($openTickets > 0) echo sprintf(' (%d)', $openTickets); ?>
                </a>
                <?php if ($closedTickets) { ?>
                    <span style="color:lightgray">|</span>
                <?php }
            }
            if ($closedTickets) { ?>
                <a class="btn btn-info <?php if ($status == 'closed') echo 'active'; ?>"
                    href="?<?php echo Http::build_query(array('a' => 'search', 'status' => 'closed')); ?>">
                    <i class="icon-file-text"></i>
                    <?php echo __('Closed'); if ($closedTickets > 0) echo sprintf(' (%d)', $closedTickets); ?>
                </a>
            <?php
            } ?>
        </small>
    </div>
</div>

<div class="table-responsive">
    <table id="ticketTable" class="table table-bordered table-hover table-striped">
        <caption><?php echo $showing; ?></caption>
        <thead>
            <tr>
                <th nowrap>
                    <a href="tickets.php?sort=ID&order=<?php echo $negorder; ?><?php echo $qstr; ?>" title="Sort By Ticket ID"><?php echo __('Ticket #');?></a>
                </th>
                <th width="120">
                    <a href="tickets.php?sort=date&order=<?php echo $negorder; ?><?php echo $qstr; ?>" title="Sort By Date"><?php echo __('Create Date');?></a>
                </th>
                <th width="100">
                    <a href="tickets.php?sort=status&order=<?php echo $negorder; ?><?php echo $qstr; ?>" title="Sort By Status"><?php echo __('Status');?></a>
                </th>
                <th width="320">
                    <a href="tickets.php?sort=subj&order=<?php echo $negorder; ?><?php echo $qstr; ?>" title="Sort By Subject"><?php echo __('Subject');?></a>
                </th>
                <th width="120">
                    <a href="tickets.php?sort=dept&order=<?php echo $negorder; ?><?php echo $qstr; ?>" title="Sort By Department"><?php echo __('Department');?></a>
                </th>
            </tr>
        </thead>
        <tbody>
        <?php
        $subject_field = TicketForm::objects()->one()->getField('subject');
        $defaultDept=Dept::getDefaultDeptName(); //Default public dept.
        if ($tickets->exists(true)) {
            foreach ($tickets as $T) {
                $dept = $T['dept__ispublic']
                    ? Dept::getLocalById($T['dept_id'], 'name', $T['dept__name'])
                    : $defaultDept;
                $subject = $subject_field->display(
                    $subject_field->to_php($T['cdata__subject']) ?: $T['cdata__subject']
                );
                $status = TicketStatus::getLocalById($T['status_id'], 'value', $T['status__name']);
                if (false) // XXX: Reimplement attachment count support
                    $subject.='  &nbsp;&nbsp;<span class="Icon file"></span>';

                $ticketNumber=$T['number'];
                if($T['isanswered'] && !strcasecmp($T['status__state'], 'open')) {
                    $subject="<b>$subject</b>";
                    $ticketNumber="<b>$ticketNumber</b>";
                }
                ?>
                <tr id="<?php echo $T['ticket_id']; ?>">
                    <td>
                    <a class="Icon <?php echo strtolower($T['source']); ?>Ticket" title="<?php echo $T['user__default_email__address']; ?>"
                        href="tickets.php?id=<?php echo $T['ticket_id']; ?>"><?php echo $ticketNumber; ?></a>
                    </td>
                    <td><?php echo Format::date($T['created']); ?></td>
                    <td><?php echo $status; ?></td>
                    <td>
                        <div style="max-height: 1.2em; max-width: 320px;" class="link truncate" href="tickets.php?id=<?php echo $T['ticket_id']; ?>"><?php echo $subject; ?></div>
                    </td>
                    <td><span class="truncate"><?php echo $dept; ?></span></td>
                </tr>
            <?php
            }

        } else {
            echo '<tr><td colspan="5">'.__('Your query did not match any records').'</td></tr>';
        }
        ?>
        </tbody>
    </table>
</div>

<?php
if ($total) {
    echo '<div id="tickets-pagination">' . __('Page') . ':' . '<div class="btn-toolbar" role="toolbar"><div class="btn-group" role="group">' . $pageNav->getPageLinks() . '</div></div></div>';
}