<?php
if(!defined('OSTCLIENTINC') || !$faq  || !$faq->isPublished()) die('Access Denied');

$category=$faq->getCategory();

?>
<div class="row">
<div class="col-xs-12 col-sm-8">

<h1><?php echo __('Frequently Asked Questions');?></h1>
<div id="breadcrumbs">
    <a href="index.php"><?php echo __('All Categories');?></a>
    &raquo; <a href="faq.php?cid=<?php echo $category->getId(); ?>"><?php echo $category->getName(); ?></a>
</div>

<div class="faq-content panel panel-default">
  <div class="panel-heading">
    <?php echo $faq->getLocalQuestion() ?>
  </div>
  <div class="panel-body">
    <?php echo $faq->getLocalAnswerWithImages(); ?>
  </div>
  <div class="panel-footer text-muted">
    <?php Format::relativeTime(Misc::db2gmtime($category->getUpdateDate())); ?>
  </div>
</div>
</div>

<div class="col-xs-12 col-sm-4">
    <div class="searchbar">
        <form method="get" action="faq.php">
        <div class="input-group">
            <div class="input-group">
                <input type="hidden" name="a" value="search"/>
                <input type="text" name="q" class="search form-control" placeholder="Search our knowledge base"/>
                <span class="input-group-btn">
                    <button type="submit" class="btn btn-success">Search</button>
                </span>
            </div>
        </div>
        </form>
    </div>
    <div class="clearfix">&nbsp;</div>
    <div class="content">
        <div class="panel panel-primary">
            <div class="panel-heading"><?php echo __('Help Topics'); ?></div>
            <div class="panel-body">
                <?php if ($attachments = $faq->getLocalAttachments()->all()) { ?>
                    <section>
                    <strong><?php echo __('Attachments');?>:</strong>
                    <?php foreach ($attachments as $att) { ?>
                        <div>
                            <a href="file.php?h=<?php echo $att['download']; ?>" class="no-pjax">
                                <i class="icon-file"></i>
                                <?php echo Format::htmlchars($att['name']); ?>
                            </a>
                        </div>
                    <?php } ?>
                    </section>
                <?php }
                if ($faq->getHelpTopics()->count()) { ?>
                    <section>
                        <strong><?php echo __('Help Topics'); ?></strong>
                        <?php foreach ($faq->getHelpTopics() as $topic) { ?>
                            <div><?php echo $topic->getFullName(); ?></div>
                        <?php } ?>
                    </section>
                <?php }
            ?></div>
        </div>
    </div>
</div>

<?php $faq->logView(); ?>
